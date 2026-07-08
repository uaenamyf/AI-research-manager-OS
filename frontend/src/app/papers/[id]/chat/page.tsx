/** Paper Chat 页面：基于论文的 RAG 问答（F5）。 */
"use client";

import { useParams } from "next/navigation";
import { ChatPanel } from "@/components/paper/ChatPanel";
import { Card } from "@/components/ui";

export default function PaperChatPage() {
  const params = useParams();
  const paperId = Number(params.id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Paper Chat</h1>
      <Card className="h-[70vh] overflow-hidden">
        <ChatPanel paperId={paperId} />
      </Card>
    </div>
  );
}
