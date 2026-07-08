/** Review Assistant 相关 API（F7）。 */
import { apiFetch } from "./client";
import type { AiTask, ID, ReviewGenerateRequest } from "@/types";

/** 生成 Literature Review（异步，返回 taskId） */
export function generateReview(
  data: ReviewGenerateRequest,
): Promise<{ taskId: ID }> {
  return apiFetch<{ taskId: ID }>("/api/review/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 轮询任务结果 */
export function getReviewTask(taskId: ID): Promise<AiTask> {
  return apiFetch<AiTask>(`/api/review/${taskId}`);
}

/**
 * 轮询直到任务完成（SUCCESS / FAILED）。
 * @param taskId 任务 ID
 * @param interval 轮询间隔（ms），默认 2000
 * @param onUpdate 状态更新回调
 */
export function pollReviewTask(
  taskId: ID,
  interval = 2000,
  onUpdate?: (task: AiTask) => void,
): Promise<AiTask> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const task = await getReviewTask(taskId);
        onUpdate?.(task);
        if (task.status === "SUCCESS") {
          resolve(task);
        } else if (task.status === "FAILED") {
          reject(new Error(task.error ?? "Review generation failed"));
        } else {
          setTimeout(poll, interval);
        }
      } catch (err) {
        reject(err);
      }
    };
    poll();
  });
}