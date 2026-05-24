# -*- coding: utf-8 -*-
import os
from datetime import datetime

# -------------------------- 环境变量配置 --------------------------
os.environ["NO_PROXY"] = "dashscope.aliyuncs.com,aliyuncs.com"
os.environ["HTTP_PROXY"] = ""
os.environ["HTTPS_PROXY"] = ""

# -------------------------- 文件夹配置 --------------------------
today_date = datetime.now().strftime("%Y%m%d")
BPMN_FILE_DIR = os.path.join("bpmn_files", today_date)

# 自动创建BPMN存储文件夹
def init_bpmn_dir():
    if not os.path.exists(BPMN_FILE_DIR):
        os.makedirs(BPMN_FILE_DIR)
        print(f"create bpmn store file storage directory success: {BPMN_FILE_DIR}")
    return BPMN_FILE_DIR