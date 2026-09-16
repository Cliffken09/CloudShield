import os
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

DB_CONNECTION = os.getenv("DB_CONNECTION")


def execute_sql_query(sql_query, query_parameters=None, fetch=None):
    with psycopg.connect(DB_CONNECTION, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql_query, query_parameters)
            if fetch == "one":
                return cursor.fetchone()
            if fetch == "all":
                return cursor.fetchall()
            return None
