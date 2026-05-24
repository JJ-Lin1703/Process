import urllib.parse
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, status, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from pydantic import BaseModel
import random
import string
import json
from typing import Literal
from datetime import datetime, timedelta
from jose import jwt, JWTError

from core.core_functions import generate_bpmn_xml, generate_interactive_flow
from core.db_operations import (
    get_user_flow_by_id,
    create_user_bpmn_flow,
    update_bpmn_xml_content,
    delete_user_flow,
    create_user,
    get_user_by_username,
    get_user_by_email,
    verify_password,
    set_reset_token,
    get_user_by_reset_token,
    clear_reset_token,
    update_password,
    create_user_fine_tune,
    update_bpmn_flow_name,
    get_user_fine_tunes,
    get_user_all_flows
)
from core.file_operations import save_bpmn_to_local, import_bpmn_file, export_bpmn_file

app = FastAPI(title="AI流程建模-BPMN接口")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== JWT 认证 ====================
SECRET_KEY = "bpmn_ai_2025_secret"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=False)

# ==================== 请求模型 ====================
ModelName = Literal["kimi-k2.6", "qwen3.6-plus", "qwen3.5-flash"]

class GenerateRequest(BaseModel):
    api_key: str
    model_name: ModelName = "kimi-k2.6"
    temperature: float = 0.0
    flow_name: str = ""
    process_desc: str

class FineTuneRequest(BaseModel):
    api_key: str
    model_name: ModelName = "kimi-k2.6"
    temperature: float = 0.0
    flow_id: int
    fine_tune_instruction: str

class UpdateNameRequest(BaseModel):
    flow_id: int
    new_name: str

class SaveBpmnRequest(BaseModel):
    flow_id: int
    bpmn_xml: str

class UserRegisterRequest(BaseModel):
    username: str
    password: str
    email: str = None

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class SendCodeRequest(BaseModel):
    email: str

class ParseDocumentRequest(BaseModel):
    api_key: str
    model_name: ModelName = "kimi-k2.6"
    temperature: float = 0.0
    flow_name: str = ""

# ==================== 认证工具 ====================
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="请先登录",
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_by_username(username=username)
    if not user:
        raise credentials_exception
    return user

async def get_current_user_optional(token: str = Depends(oauth2_scheme)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            return None
        user = get_user_by_username(username=username)
        return user
    except JWTError:
        return None

# ==================== 匿名用户机制 ====================
def get_client_ip(request):
    """获取客户端IP地址"""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip
    return request.client.host

def generate_anonymous_username(ip_address: str) -> str:
    """基于IP地址生成匿名用户名"""
    import hashlib
    # 对IP进行哈希处理，生成唯一标识
    hash_obj = hashlib.sha256(ip_address.encode())
    return f"guest_{hash_obj.hexdigest()[:16]}"

def get_or_create_anonymous_user(ip_address: str):
    """获取或创建匿名用户"""
    username = generate_anonymous_username(ip_address)
    
    # 检查用户是否存在
    user = get_user_by_username(username)
    if user:
        return user
    
    # 创建匿名用户（密码随机生成）
    random_password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
    user = create_user(username, random_password)
    return user

# ==================== 邮件发送工具 ====================
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr
import uuid

SMTP_CONFIG = {
    "host": "smtp.qq.com",
    "port": 587,
    "username": "your_email@qq.com",
    "password": "your_email_password",
    "sender_name": "BPMN智能建模"
}

def send_email(to_email: str, subject: str, content: str):
    try:
        msg = MIMEText(content, 'html', 'utf-8')
        msg['From'] = formataddr([SMTP_CONFIG["sender_name"], SMTP_CONFIG["username"]])
        msg['To'] = to_email
        msg['Subject'] = subject

        server = smtplib.SMTP(SMTP_CONFIG["host"], SMTP_CONFIG["port"])
        server.starttls()
        server.login(SMTP_CONFIG["username"], SMTP_CONFIG["password"])
        server.sendmail(SMTP_CONFIG["username"], [to_email], msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"发送邮件失败: {str(e)}")
        return False

# 存储验证码（实际生产环境使用Redis）
verification_codes = {}

def generate_verification_code(length: int = 6):
    return ''.join(random.choices(string.digits, k=length))

# ==================== 登录 / 注册 ====================
@app.post("/api/register")
async def register(user: UserRegisterRequest):
    if get_user_by_username(user.username):
        raise HTTPException(status_code=400, detail="用户名已存在")
    email = user.email.strip() if user.email else None
    if email and get_user_by_email(email):
        raise HTTPException(status_code=400, detail="该邮箱已被注册")
    create_user(username=user.username, password=user.password, email=email)
    return {"code": 200, "msg": "register success"}

@app.post("/api/send-code")
async def send_code(request: SendCodeRequest):
    user = get_user_by_email(request.email)
    if not user:
        raise HTTPException(status_code=400, detail="该邮箱未注册")
    
    code = generate_verification_code()
    verification_codes[request.email] = {
        "code": code,
        "expire_time": datetime.now() + timedelta(minutes=5),
        "user_id": user.id
    }
    
    print(f"【测试模式】验证码已生成：{code}（邮箱：{request.email}）")
    
    return {"code": 200, "msg": "验证码已发送", "data": {"code": code}}

@app.post("/api/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    user = get_user_by_email(request.email)
    if not user:
        raise HTTPException(status_code=400, detail="该邮箱未注册")
    
    reset_token = str(uuid.uuid4()).replace('-', '')
    expire_time = datetime.now() + timedelta(hours=1)
    set_reset_token(user.id, reset_token, expire_time)

    reset_link = f"http://localhost:5173/reset-password.html?token={reset_token}"
    
    print(f"【测试模式】密码找回链接已生成：{reset_link}（邮箱：{request.email}）")
    
    return {"code": 200, "msg": "找回链接已发送至您的邮箱", "data": {"reset_link": reset_link}}

@app.post("/api/reset-password")
async def reset_password(request: ResetPasswordRequest):
    user = get_user_by_reset_token(request.token)
    if not user:
        raise HTTPException(status_code=400, detail="链接无效或已过期")
    
    update_password(user.id, request.new_password)
    clear_reset_token(user.id)
    return {"code": 200, "msg": "reset password success"}

@app.post("/api/verify-code")
async def verify_code(request: SendCodeRequest):
    code_info = verification_codes.get(request.email)
    if not code_info or code_info["expire_time"] < datetime.now():
        raise HTTPException(status_code=400, detail="验证码无效或已过期")
    return {"code": 200, "msg": "验证码有效", "data": {"username": get_user_by_email(request.email).username}}

@app.post("/api/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_username(form_data.username)
    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_access_token(data={"sub": user.username})
    return {
        "code": 200,
        "msg": "login success",
        "data": {"token": token, "user_id": user.id, "username": user.username}
    }

# ==================== 业务接口（全部登录+新表） ====================

@app.post("/api/generate-bpmn")
async def generate_bpmn(request: GenerateRequest, current_user=Depends(get_current_user_optional), request_obj: Request = None):
    try:
        if not request.api_key:
            raise HTTPException(status_code=400, detail="API-KEY不能为空")

        # 如果未登录，使用匿名用户
        if not current_user:
            ip_address = get_client_ip(request_obj)
            current_user = get_or_create_anonymous_user(ip_address)

        if not request.process_desc:
            raise HTTPException(status_code=400, detail="流程描述不能为空")
        
        flow_data = generate_interactive_flow(
            request.process_desc, request.api_key,
            request.model_name, request.temperature, is_fine_tune=False
        )
        bpmn_xml = generate_bpmn_xml(flow_data)

        if not bpmn_xml:
            raise HTTPException(status_code=500, detail="BPMN生成失败")

        if not request.flow_name.strip():
            random_chars = ''.join(random.choices(string.ascii_uppercase, k=2))
            random_nums = ''.join(random.choices(string.digits, k=2))
            request.flow_name = f"BPMN_{random_chars}{random_nums}"

        # 保存到数据库（使用匿名用户或登录用户）
        flow_record = create_user_bpmn_flow(
            user_id=current_user.id,
            flow_name=request.flow_name,
            process_desc=request.process_desc,
            flow_json=json.dumps(flow_data, ensure_ascii=False),
            bpmn_xml=bpmn_xml
        )
        flow_id = flow_record.id
        save_bpmn_to_local(bpmn_xml, request.flow_name)

        return {
            "code": 200,
            "msg": "generate success",
            "data": {"flow_id": flow_id, "flow_name": request.flow_name, "bpmn_xml": bpmn_xml}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成失败：{str(e)}")

@app.post("/api/fine-tune-bpmn")
async def fine_tune_bpmn_api(request: FineTuneRequest, current_user=Depends(get_current_user)):
    try:
        if not request.api_key or not request.fine_tune_instruction:
            raise HTTPException(status_code=400, detail="API-KEY和微调指令不能为空")

        flow_record = get_user_flow_by_id(current_user.id, request.flow_id)
        if not flow_record:
            raise HTTPException(status_code=400, detail="无权限或流程不存在")

        from core.utils.session_utils import global_session
        global_session.current_user_id = current_user.id
        global_session.current_flow_id = request.flow_id

        flow_data = generate_interactive_flow(
            request.fine_tune_instruction, request.api_key,
            request.model_name, request.temperature, is_fine_tune=True
        )
        if not flow_data:
            raise HTTPException(status_code=500, detail="微调失败")

        bpmn_xml = generate_bpmn_xml(flow_data, is_fine_tune=True)
        create_user_fine_tune(request.flow_id, request.fine_tune_instruction)
        save_bpmn_to_local(bpmn_xml, flow_record.flow_name, is_fine_tune=True)

        return {"code": 200, "msg": "fine tune success", "data": {"flow_id": request.flow_id, "bpmn_xml": bpmn_xml}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"微调失败：{str(e)}")
    finally:
        from core.utils.session_utils import global_session
        global_session.current_user_id = None
        global_session.current_flow_id = None

@app.post("/api/import-bpmn")
async def import_bpmn_api(file: UploadFile = File(...), current_user=Depends(get_current_user_optional), request: Request = None):
    try:
        if not file.filename.endswith(".bpmn"):
            raise HTTPException(status_code=400, detail="仅支持.bpmn")
        content = await file.read()
        
        # 如果未登录，使用匿名用户
        if not current_user:
            ip_address = get_client_ip(request)
            current_user = get_or_create_anonymous_user(ip_address)
        
        flow_id, name, xml = import_bpmn_file(current_user.id, content, file.filename)
        
        return {"code": 200, "msg": "import success", "data": {"flow_id": flow_id, "flow_name": name, "bpmn_xml": xml}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败：{str(e)}")

@app.get("/api/export-bpmn/{flow_id}")
async def export_bpmn_api(flow_id: int, current_user=Depends(get_current_user_optional), request: Request = None):
    try:
        # 如果未登录，使用匿名用户
        if not current_user:
            ip_address = get_client_ip(request)
            current_user = get_or_create_anonymous_user(ip_address)
        
        flow = get_user_flow_by_id(current_user.id, flow_id)
        if not flow:
            raise HTTPException(status_code=400, detail="无权限")
        buf, fname = export_bpmn_file(current_user.id, flow_id, flow.flow_name)
        encoded = urllib.parse.quote(fname, encoding="utf-8")
        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded}",
            "Content-Type": "application/xml; charset=utf-8"
        }
        return StreamingResponse(buf, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败：{str(e)}")

@app.post("/api/update-flow-name")
async def update_flow_name_api(req: UpdateNameRequest, current_user=Depends(get_current_user_optional), request: Request = None):
    if not current_user:
        ip_address = get_client_ip(request)
        current_user = get_or_create_anonymous_user(ip_address)
    
    ok, msg = update_bpmn_flow_name(req.flow_id, req.new_name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"code": 200, "msg": msg, "data": {"flow_id": req.flow_id, "new_name": req.new_name}}

@app.post("/api/save-bpmn")
async def save_bpmn_api(req: SaveBpmnRequest, current_user=Depends(get_current_user_optional), request: Request = None):
    if not current_user:
        ip_address = get_client_ip(request)
        current_user = get_or_create_anonymous_user(ip_address)
    
    rec = update_bpmn_xml_content(req.flow_id, req.bpmn_xml)
    if not rec:
        raise HTTPException(status_code=400, detail="save bpmn failed")
    return {"code": 200, "msg": "save bpmn success", "data": {"flow_id": req.flow_id}}

@app.delete("/api/delete-flow/{flow_id}")
async def delete_flow_api(flow_id: int, current_user=Depends(get_current_user_optional), request: Request = None):
    if not current_user:
        ip_address = get_client_ip(request)
        current_user = get_or_create_anonymous_user(ip_address)
    
    if not delete_user_flow(current_user.id, flow_id):
        raise HTTPException(status_code=400, detail="delete failed")
    return {"code": 200, "msg": "delete success", "data": {"flow_id": flow_id}}

@app.get("/api/flow-detail/{flow_id}")
async def get_flow_detail(flow_id: int, current_user=Depends(get_current_user_optional), request: Request = None):
    # 如果未登录，使用匿名用户
    if not current_user:
        ip_address = get_client_ip(request)
        current_user = get_or_create_anonymous_user(ip_address)
    
    flow = get_user_flow_by_id(current_user.id, flow_id)
    if not flow:
        raise HTTPException(status_code=400, detail="无权限")
    prompts = get_user_fine_tunes(flow_id)
    return {
        "code": 200,
        "msg": "select success",
        "data": {
            "flow_id": flow.id,
            "flow_name": flow.flow_name,
            "process_desc": flow.process_desc,
            "bpmn_xml": flow.bpmn_xml,
            "create_time": flow.create_time.strftime("%Y-%m-%d %H:%M:%S"),
            "fine_tune_prompts": [
                {"id": p.id, "prompt": p.fine_tune_prompt, "create_time": p.create_time.strftime("%Y-%m-%d %H:%M:%S")}
                for p in prompts
            ]
        }
    }

@app.get("/api/flow-list")
async def get_flow_list(current_user=Depends(get_current_user_optional), request: Request = None):
    # 如果未登录，使用匿名用户
    if not current_user:
        ip_address = get_client_ip(request)
        current_user = get_or_create_anonymous_user(ip_address)
    
    flows = get_user_all_flows(current_user.id)
    return {
        "code": 200,
        "msg": "list success",
        "data": [
            {
                "flow_id": f.id,
                "flow_name": f.flow_name,
                "process_desc": f.process_desc,
                "create_time": f.create_time.strftime("%Y-%m-%d %H:%M:%S")
            } for f in flows
        ]
    }

@app.post("/api/parse-document")
async def parse_document(
    api_key: str = Form(...),
    model_name: ModelName = Form("kimi-k2.6"),
    temperature: float = Form(0.0),
    flow_name: str = Form(""),
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    """解析 .txt, .doc, .docx, .dot 文件，提取文本内容并直接生成BPMN"""
    if not api_key:
        raise HTTPException(status_code=400, detail="API-KEY不能为空")
    
    filename = file.filename.lower()
    
    if not any(filename.endswith(ext) for ext in ['.txt', '.doc', '.docx', '.dot']):
        raise HTTPException(status_code=400, detail="仅支持 .txt, .doc, .docx, .dot 格式文件")
    
    content = await file.read()
    
    try:
        if filename.endswith('.docx'):
            from io import BytesIO
            from docx import Document
            doc = Document(BytesIO(content))
            text = '\n'.join([para.text for para in doc.paragraphs])
        elif filename.endswith('.doc'):
            try:
                import textract
                text = textract.process(BytesIO(content)).decode('utf-8')
            except ImportError:
                raise HTTPException(status_code=400, detail=".doc 格式需要安装 textract 库，请将文件转换为 .docx 格式后重试")
            except Exception:
                raise HTTPException(status_code=400, detail=".doc 格式解析失败，请将文件转换为 .docx 格式后重试")
        else:
            try:
                text = content.decode('utf-8')
            except UnicodeDecodeError:
                text = content.decode('gbk', errors='ignore')
        
        if not text or not text.strip():
            raise HTTPException(status_code=400, detail="文件中未提取到有效文本内容")
        
        # 直接调用生成函数
        flow_data = generate_interactive_flow(
            text, api_key,
            model_name, temperature, is_fine_tune=False
        )
        bpmn_xml = generate_bpmn_xml(flow_data)

        if not bpmn_xml:
            raise HTTPException(status_code=500, detail="BPMN生成失败")

        if not flow_name.strip():
            random_chars = ''.join(random.choices(string.ascii_uppercase, k=2))
            random_nums = ''.join(random.choices(string.digits, k=2))
            flow_name = f"BPMN_{random_chars}{random_nums}"

        # 保存到数据库
        flow_record = create_user_bpmn_flow(
            user_id=current_user.id,
            flow_name=flow_name,
            process_desc=text,
            flow_json=json.dumps(flow_data, ensure_ascii=False),
            bpmn_xml=bpmn_xml
        )
        flow_id = flow_record.id
        save_bpmn_to_local(bpmn_xml, flow_name)

        return {
            "code": 200,
            "msg": "generate success",
            "data": {"flow_id": flow_id, "flow_name": flow_name, "bpmn_xml": bpmn_xml}
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件解析失败：{str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)