import { Task } from "../types";

export const generateTasksFromCase = async (
  caseDescription: string,
  workflowDescription: string,
  startDate: string
): Promise<Partial<Task>[]> => {
  const response = await fetch("/api/generate-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseDescription, workflowDescription, startDate }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate tasks. Please try again.");
  }

  const generatedData = await response.json();

  const start = new Date(startDate);

  return generatedData.map((item: any) => {
    const taskDate = new Date(start);
    taskDate.setDate(start.getDate() + (item.daysOffset || 0));

    return {
      title: item.title,
      description: item.description,
      date: taskDate.toISOString().split("T")[0],
      isCompleted: false,
      generatedByAi: true,
    };
  });
};
