package com.researchos.common.handler;

import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;

import java.lang.reflect.Constructor;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Map;

/**
 * PostgreSQL JSONB 类型处理器。
 * 继承 JacksonTypeHandler 的序列化逻辑，但写入时用 PGobject 包装，
 * 解决 PostgreSQL "字段类型为 jsonb, 但表达式的类型为 character varying" 错误。
 * 用反射创建 PGobject，避免编译期对 postgresql 驱动的依赖（scope=runtime）。
 *
 * @author myf
 * @since 2026-07-10
 */
@MappedJdbcTypes(JdbcType.OTHER)
@MappedTypes(Map.class)
public class JsonbTypeHandler extends JacksonTypeHandler {

    public JsonbTypeHandler(Class<?> type) {
        super(type);
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i,
                                    Object parameter, JdbcType jdbcType) throws SQLException {
        // 先用父类序列化为 JSON 字符串
        String json;
        if (parameter == null) {
            json = null;
        } else if (parameter instanceof String str) {
            json = str;
        } else {
            try {
                json = getObjectMapper().writeValueAsString(parameter);
            } catch (Exception e) {
                throw new SQLException("JSON 序列化失败", e);
            }
        }

        // 用反射创建 PGobject 包装，指定类型为 jsonb
        try {
            Class<?> pgObjectClass = Class.forName("org.postgresql.util.PGobject");
            Constructor<?> constructor = pgObjectClass.getConstructor();
            Object pgObject = constructor.newInstance();
            pgObjectClass.getMethod("setType", String.class).invoke(pgObject, "jsonb");
            pgObjectClass.getMethod("setValue", String.class).invoke(pgObject, json);
            ps.setObject(i, pgObject);
        } catch (ClassNotFoundException e) {
            // 非 PostgreSQL 环境，直接设字符串
            ps.setString(i, json);
        } catch (Exception e) {
            throw new SQLException("PGobject 创建失败", e);
        }
    }
}
