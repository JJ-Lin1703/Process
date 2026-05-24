import io
import os
from datetime import datetime
from config import init_bpmn_dir

from core.db_operations import (
    get_user_flow_by_id,
    create_user_bpmn_flow
)
from core.utils.XMLtoJSON import parse_bpmn_to_flow_json


def export_bpmn_file(user_id, flow_id, flow_name):
    flow_record = get_user_flow_by_id(user_id, flow_id)
    if not flow_record or not flow_record.bpmn_xml:
        raise Exception("该流程无BPMN XML数据")

    bpmn_filename = f"{flow_name}.bpmn"
    bpmn_buffer = io.BytesIO()
    bpmn_buffer.write(flow_record.bpmn_xml.encode("utf-8"))
    bpmn_buffer.seek(0)
    return bpmn_buffer, bpmn_filename


def import_bpmn_file(user_id, file_content, file_name):
    try:
        try:
            raw_bpmn_xml = file_content.decode("utf-8")
        except UnicodeDecodeError:
            raw_bpmn_xml = file_content.decode("gbk")

        cleaned_bpmn_xml = raw_bpmn_xml.strip()
        flow_json = parse_bpmn_to_flow_json(cleaned_bpmn_xml)

        flow_name = file_name.replace('.bpmn', '')

        # 换成新表：必须绑定 user_id
        new_flow_record = create_user_bpmn_flow(
            user_id=user_id,
            flow_name=flow_name,
            process_desc="本地导入的BPMN文件",
            flow_json=flow_json,
            bpmn_xml=cleaned_bpmn_xml
        )
        return new_flow_record.id, flow_name, cleaned_bpmn_xml
    except Exception as e:
        raise Exception(f"文件解析或存储失败：{str(e)}")


# 保存BPMN到本地文件夹（无需改动）
def save_bpmn_to_local(bpmn_xml, flow_name, is_fine_tune=False):
    BPMN_FILE_DIR = init_bpmn_dir()
    if is_fine_tune:
        fine_tuned_filename = f"{flow_name}_微调_{datetime.now().strftime('%Y%m%d_%H%M%S')}.bpmn"
        full_path = os.path.join(BPMN_FILE_DIR, fine_tuned_filename)
    else:
        full_path = os.path.join(BPMN_FILE_DIR, f"{flow_name}.bpmn")

    with open(full_path, "w", encoding="utf-8") as f:
        f.write(bpmn_xml)
    return full_path