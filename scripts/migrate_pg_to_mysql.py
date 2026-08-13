# date: 2026-08-13
# dev: myf
"""PostgreSQL → MySQL 业务数据迁移脚本（双库架构）。

迁移范围（业务表 → MySQL）：
    app_user, research_project, folder, paper, conversation, ai_task

AI 向量数据 paper_chunk 保留在 PostgreSQL 向量库（pgvector），不迁移。

要点：
- 保留原 id（业务外键关联不破坏）
- TIMESTAMPTZ → DATETIME(6)：转 Asia/Shanghai 本地时间
- JSONB → JSON：json.dumps 序列化
- 幂等：目标表先 TRUNCATE（空表则无影响）
"""

import json
import sys
from datetime import datetime, timezone

import psycopg2
import pymysql

PG_DSN = "host=localhost port=5432 dbname=researchos user=researchos password=researchos"
MYSQL_CFG = dict(host="localhost", port=3306, user="researchos", password="researchos",
                 database="researchos", charset="utf8mb4")

# 表名 -> (列列表, JSON 列, 时间列列表)
TABLES = {
    "app_user": (
        ["id", "email", "password", "oauth_provider", "oauth_id", "plan", "created_time", "settings"],
        ["settings"],
        ["created_time"],
    ),
    "research_project": (
        ["id", "user_id", "name", "description", "domain", "created_time"],
        [],
        ["created_time"],
    ),
    "folder": (
        ["id", "user_id", "project_id", "parent_id", "name", "sort_order", "created_at", "updated_at"],
        [],
        ["created_at", "updated_at"],
    ),
    "paper": (
        ["id", "project_id", "user_id", "folder_id", "title", "authors", "year", "doi",
         "pdf_url", "summary", "status", "created_time"],
        ["summary"],
        ["created_time"],
    ),
    "conversation": (
        ["id", "user_id", "paper_id", "question", "answer", "created_time"],
        [],
        ["created_time"],
    ),
    "ai_task": (
        ["task_id", "user_id", "type", "status", "result", "error", "created_time"],
        ["result"],
        ["created_time"],
    ),
}


def convert_value(value, is_json: bool, is_time: bool):
    """按目标列类型转换值。"""
    if value is None:
        return None
    if is_json:
        # psycopg2 读 jsonb 已是 dict/list，json.dumps 序列化为 JSON 字符串
        return json.dumps(value, ensure_ascii=False)
    if is_time:
        # TIMESTAMPTZ -> Asia/Shanghai 本地时间字符串（MySQL DATETIME(6)）
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                value = value.astimezone(timezone.utc).replace(tzinfo=None)
            return value.strftime("%Y-%m-%d %H:%M:%S.%f")
        return str(value)
    return value


def migrate_table(pg_conn, my_conn, table: str) -> int:
    cols, json_cols, time_cols = TABLES[table]
    col_list = ", ".join(cols)
    placeholders = ", ".join(["%s"] * len(cols))

    with pg_conn.cursor() as pg_cur:
        pg_cur.execute(f'SELECT {col_list} FROM "{table}"')
        rows = pg_cur.fetchall()

    if not rows:
        print(f"[跳过] {table}: 无数据")
        return 0

    insert_sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"
    converted = [
        tuple(convert_value(v, c in json_cols, c in time_cols) for c, v in zip(cols, row))
        for row in rows
    ]

    with my_conn.cursor() as my_cur:
        my_cur.executemany(insert_sql, converted)
    my_conn.commit()

    print(f"[成功] {table}: {len(rows)} 行")
    return len(rows)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    pg_conn = psycopg2.connect(PG_DSN)
    my_conn = pymysql.connect(**MYSQL_CFG, autocommit=False)

    try:
        # 幂等：清空目标表（pymysql 不支持多语句，需逐个执行）
        with my_conn.cursor() as cur:
            cur.execute("SET FOREIGN_KEY_CHECKS=0")
            for table in TABLES:
                cur.execute(f"TRUNCATE TABLE {table}")
            cur.execute("SET FOREIGN_KEY_CHECKS=1")
        my_conn.commit()
        print("已清空 MySQL 目标表")

        total = 0
        for table in TABLES:
            total += migrate_table(pg_conn, my_conn, table)

        print(f"\n迁移完成，共 {total} 行")
    finally:
        pg_conn.close()
        my_conn.close()


if __name__ == "__main__":
    main()
