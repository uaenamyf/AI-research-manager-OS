package com.researchos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 文件夹实体：项目内的层级文件管理。
 *
 * @author myf
 * @since 2026-07-23
 */
@Data
@TableName("folder")
public class Folder {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private Long projectId;

    /**
     * 父文件夹 ID，null 表示根目录
     */
    private Long parentId;

    private String name;

    /**
     * 排序权重，越大越靠前
     */
    private Integer sortOrder;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    /**
     * 子文件夹（仅树接口填充，非数据库列）
     */
    @TableField(exist = false)
    private List<Folder> children;
}
