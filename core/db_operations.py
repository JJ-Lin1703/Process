# -*- coding: utf-8 -*-
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from passlib.context import CryptContext

# -------------------------- 数据库配置 --------------------------
MYSQL_CONFIG = {
    "user": "root",
    "password": "ljj20051101",
    "host": "localhost",
    "port": 3306,
    "database": "bpmn_db"
}

DATABASE_URL = (
    f"mysql+mysqlconnector://{MYSQL_CONFIG['user']}:{MYSQL_CONFIG['password']}@"
    f"{MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}/{MYSQL_CONFIG['database']}?charset=utf8mb4"
)

Base = declarative_base()
engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20, pool_recycle=3600, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 密码加密 - 使用 PBKDF2 替代 bcrypt，避免版本兼容问题
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# ====================== ORM 模型 ======================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    email = Column(String(100), unique=True, nullable=True)
    reset_token = Column(String(64), nullable=True)
    reset_token_expire = Column(DateTime, nullable=True)
    create_time = Column(DateTime, default=datetime.now)

class UserBpmnFlow(Base):
    __tablename__ = "user_bpmn_flows"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    flow_name = Column(String(100), nullable=False)
    process_desc = Column(Text, nullable=False)
    flow_json = Column(Text, nullable=False)
    bpmn_xml = Column(Text, nullable=False)
    create_time = Column(DateTime, default=datetime.now)
    update_time = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class UserBpmnFineTune(Base):
    __tablename__ = "user_bpmn_fine_tunes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    flow_record_id = Column(Integer, nullable=False)
    fine_tune_prompt = Column(Text, nullable=False)
    create_time = Column(DateTime, default=datetime.now)

# ====================== 会话 ======================

def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def with_db_session(func):
    def wrapper(*args, **kwargs):
        db = SessionLocal()
        try:
            return func(db, *args, **kwargs)
        finally:
            db.close()
    return wrapper

# ====================== 用户相关 ======================

def create_user(username: str, password: str, email: str = None):
    hashed_pwd = pwd_context.hash(password)
    db = SessionLocal()
    try:
        email = email if email and email.strip() else None
        user = User(username=username, password=hashed_pwd, email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()

def get_user_by_username(username: str):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.username == username).first()
    finally:
        db.close()

def get_user_by_email(email: str):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).first()
    finally:
        db.close()

def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)

def set_reset_token(user_id: int, token: str, expire_time: datetime):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.reset_token = token
            user.reset_token_expire = expire_time
            db.commit()
            return True
        return False
    finally:
        db.close()

def get_user_by_reset_token(token: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.reset_token == token).first()
        if user and user.reset_token_expire and user.reset_token_expire > datetime.now():
            return user
        return None
    finally:
        db.close()

def clear_reset_token(user_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.reset_token = None
            user.reset_token_expire = None
            db.commit()
            return True
        return False
    finally:
        db.close()

def update_password(user_id: int, new_password: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.password = pwd_context.hash(new_password)
            db.commit()
            return True
        return False
    finally:
        db.close()

def update_user_email(user_id: int, email: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.email = email
            db.commit()
            return True
        return False
    finally:
        db.close()

# ====================== 流程 CRUD ======================

def create_user_bpmn_flow(user_id: int, flow_name: str, process_desc: str, flow_json: str, bpmn_xml: str):
    db = SessionLocal()
    try:
        flow = UserBpmnFlow(
            user_id=user_id,
            flow_name=flow_name,
            process_desc=process_desc,
            flow_json=flow_json,
            bpmn_xml=bpmn_xml
        )
        db.add(flow)
        db.commit()
        db.refresh(flow)
        return flow
    finally:
        db.close()

def get_user_all_flows(user_id: int):
    db = SessionLocal()
    try:
        return db.query(UserBpmnFlow)\
            .filter(UserBpmnFlow.user_id == user_id)\
            .order_by(UserBpmnFlow.create_time.desc())\
            .all()
    finally:
        db.close()

def get_user_flow_by_id(user_id: int, flow_id: int):
    db = SessionLocal()
    try:
        return db.query(UserBpmnFlow)\
            .filter(UserBpmnFlow.user_id == user_id)\
            .filter(UserBpmnFlow.id == flow_id)\
            .first()
    finally:
        db.close()

def delete_user_flow(user_id: int, flow_id: int):
    db = SessionLocal()
    try:
        db.query(UserBpmnFineTune)\
          .filter(UserBpmnFineTune.flow_record_id == flow_id)\
          .delete()

        count = db.query(UserBpmnFlow)\
            .filter(UserBpmnFlow.id == flow_id)\
            .filter(UserBpmnFlow.user_id == user_id)\
            .delete()
        db.commit()
        return count > 0
    except Exception:
        return False
    finally:
        db.close()

def update_bpmn_flow_name(record_id: int, new_flow_name: str):
    db = SessionLocal()
    try:
        record = db.query(UserBpmnFlow).filter(UserBpmnFlow.id == record_id).first()
        if not record:
            return False, "流程不存在"
        if not new_flow_name.strip():
            return False, "名称不能为空"
        record.flow_name = new_flow_name.strip()
        db.commit()
        return True, "update success"
    except Exception as e:
        return False, str(e)
    finally:
        db.close()

def update_bpmn_xml_content(record_id: int, new_bpmn_xml: str):
    db = SessionLocal()
    try:
        record = db.query(UserBpmnFlow).filter(UserBpmnFlow.id == record_id).first()
        if not record:
            return None
        record.bpmn_xml = new_bpmn_xml
        db.commit()
        db.refresh(record)
        return record
    finally:
        db.close()

def update_bpmn_flow_json(record_id: int, new_flow_json: str):
    db = SessionLocal()
    try:
        record = db.query(UserBpmnFlow).filter(UserBpmnFlow.id == record_id).first()
        if not record:
            return None
        record.flow_json = new_flow_json
        db.commit()
        db.refresh(record)
        return record
    finally:
        db.close()

def get_process_desc_by_id(record_id: int):
    db = SessionLocal()
    try:
        record = db.query(UserBpmnFlow).filter(UserBpmnFlow.id == record_id).first()
        return record.process_desc if record else None
    finally:
        db.close()

# ====================== 微调 ======================

def create_user_fine_tune(flow_record_id: int, fine_tune_prompt: str):
    db = SessionLocal()
    try:
        tune = UserBpmnFineTune(
            flow_record_id=flow_record_id,
            fine_tune_prompt=fine_tune_prompt
        )
        db.add(tune)
        db.commit()
        db.refresh(tune)
        return tune
    finally:
        db.close()

def get_user_fine_tunes(flow_record_id: int):
    db = SessionLocal()
    try:
        return db.query(UserBpmnFineTune)\
            .filter(UserBpmnFineTune.flow_record_id == flow_record_id)\
            .order_by(UserBpmnFineTune.create_time.asc())\
            .all()
    finally:
        db.close()

# ====================== 初始化 ======================
def init_database():
    Base.metadata.create_all(bind=engine)
    print("数据库表初始化完成")

if __name__ == "__main__":
    init_database()