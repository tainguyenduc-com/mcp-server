import { createTask, claimTask, listTasks } from './taskService.js';

export async function taskmanager_task_create(params) {
  return createTask(params);
}

export async function taskmanager_task_claim({ taskId, agentName }) {
  return claimTask(taskId, agentName);
}

export async function taskmanager_task_list(filter) {
  return listTasks(filter);
}
