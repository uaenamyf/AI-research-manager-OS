/** 项目列表页（F2）。 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProjects, createProject } from "@/lib/api/projects";
import { Button, Input, Textarea, Card } from "@/components/ui";
import type { ResearchProject } from "@/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const page = await listProjects(0, 50);
    setProjects(page.items);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createProject({ name, description, domain });
      setName("");
      setDescription("");
      setDomain("");
      setShowForm(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Project"}
        </Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Name
              </label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Deep Learning for Animal Vocal Recognition"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Domain
              </label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Bioacoustics"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card className="p-4 transition-shadow hover:shadow-md">
              <h3 className="font-semibold text-gray-900">{p.name}</h3>
              <p className="mt-1 text-xs text-gray-500">{p.domain}</p>
              {p.description && (
                <p className="mt-2 text-sm text-gray-600">{p.description}</p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
