"""
Serviço de detecção de conflitos.
Verifica sobreposição de horários entre compromissos e tarefas agendadas.
"""
from datetime import date, time, datetime
from sqlalchemy.orm import Session
import models

WEEKDAY_NAMES_PT = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"]


def _overlaps(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    return start_a < end_b and start_b < end_a


def check_appointment_conflict(db: Session, user_id: int, day: date, start: time, end: time,
                                ignore_id: int = None, ignore_task_id: int = None):
    """Retorna lista de compromissos, tarefas agendadas e blocos de rotina fixa que conflitam com o intervalo."""
    conflicts = []
    q = db.query(models.Appointment).filter(
        models.Appointment.user_id == user_id,
        models.Appointment.date == day,
    )
    if ignore_id:
        q = q.filter(models.Appointment.id != ignore_id)
    for appt in q.all():
        if _overlaps(start, end, appt.start_time, appt.end_time):
            conflicts.append({
                "type": "appointment",
                "id": appt.id,
                "title": appt.title,
                "start_time": appt.start_time.strftime("%H:%M"),
                "end_time": appt.end_time.strftime("%H:%M"),
            })

    # tarefas agendadas no mesmo dia com hora definida (assume duração em minutos)
    tasks = db.query(models.Task).filter(
        models.Task.user_id == user_id,
        models.Task.scheduled_date == day,
        models.Task.scheduled_time.isnot(None),
    )
    if ignore_task_id:
        tasks = tasks.filter(models.Task.id != ignore_task_id)
    for t in tasks.all():
        t_start = t.scheduled_time
        t_end_minutes = t_start.hour * 60 + t_start.minute + (t.duration or 30)
        t_end = time(hour=min(t_end_minutes // 60, 23), minute=t_end_minutes % 60)
        if _overlaps(start, end, t_start, t_end):
            conflicts.append({
                "type": "task",
                "id": t.id,
                "title": t.title,
                "start_time": t_start.strftime("%H:%M"),
                "end_time": t_end.strftime("%H:%M"),
            })

    # blocos fixos da rotina diária do usuário para este dia da semana
    day_name = WEEKDAY_NAMES_PT[day.weekday()]
    routine_blocks = db.query(models.RoutineBlock).filter(
        models.RoutineBlock.user_id == user_id,
        models.RoutineBlock.day_of_week == day_name,
    ).all()
    for rb in routine_blocks:
        if _overlaps(start, end, rb.start_time, rb.end_time):
            conflicts.append({
                "type": "routine",
                "id": rb.id,
                "title": f"Rotina fixa: {rb.title}",
                "start_time": rb.start_time.strftime("%H:%M"),
                "end_time": rb.end_time.strftime("%H:%M"),
            })
    return conflicts


def check_task_schedule_conflict(db: Session, user_id: int, day: date, start: time, duration_minutes: int,
                                  ignore_id: int = None):
    end_minutes = start.hour * 60 + start.minute + duration_minutes
    end = time(hour=min(end_minutes // 60, 23), minute=end_minutes % 60)
    return check_appointment_conflict(db, user_id, day, start, end, ignore_task_id=ignore_id)
