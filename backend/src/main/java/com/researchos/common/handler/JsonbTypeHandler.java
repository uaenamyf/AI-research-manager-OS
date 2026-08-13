package com.researchos.common.handler;

import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Map;

/**
 * MySQL JSON 类型处理器。
 * 继承 JacksonTypeHandler 的序列化逻辑，写入时直接用 setString 传 JSON 字符串，
 * 由 MySQL 驱动识别为 JSON 列值。
 *
 * @author myf
 * @since 2026-07-10
 */
@MappedJdbcTypes(JdbcType.VARCHAR)
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

        ps.setString(i, json);
    }
}
