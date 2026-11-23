import os
import tempfile
import uuid
from pathlib import Path


test_database = Path(tempfile.gettempdir()) / f"mindside-test-{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_database.as_posix()}"
