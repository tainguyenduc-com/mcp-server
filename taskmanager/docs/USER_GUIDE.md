# Task Manager MCP User Guide

## 1. Giới thiệu
Task Manager MCP Server là hệ thống trung tâm quản lý task cho AI agents. Thay thế direct handoff bằng **task queue** cho phép manager tạo task, workers tự động claim và xử lý.

## 2. Kiến trúc (modules)
- `server.js` – khởi tạo server (stdio hoặc CLI).
- `storage.js` – lưu trữ JSON duy nhất (`.task/tasks.json`), atomic write + backup.
- `constants.js` – định nghĩa trạng thái, mức độ ưu tiên.
- `tools` – triển khai 15 MCP tools (create, claim, update, report, pause, fail, cancel, list, get, find_available, tree, subtasks, ancestors, stats, server_info).

## 3. Cài đặt
```bash
git clone <repo>
cd taskmanager
npm install
# chạy server (stdio)
node server.js [abs/path/to/.task]
```
Yêu cầu: Node >=18 <23.

## 4. Danh sách 15 tools
| Tool | Mô tả | Input | Output |
|------|-------|------|--------|
| `task_create` | Tạo task/subtask | title, description, priority, tags, parentTaskId, context, reportTo | task{id}
| `task_claim` | Claim task (pending→in_progress) | taskId, agentName | task
| `task_update` | Cập nhật status/progress/context/result | taskId, status?, progress?, context?, result? | task
| `task_report` | Báo cáo hoàn thành (auto‑update parent) | taskId, summary, result? | task
| `task_pause` | Tạm dừng | taskId, reason | task
| `task_fail` | Đánh dấu thất bại | taskId, error, recoverable? | task
| `task_cancel` | Hủy task | taskId, reason? | task
| `task_list` | Liệt kê task (filter) | status?, tags?, parentTaskId?, priority? | [task]
| `task_get` | Lấy chi tiết task | taskId | task
| `task_find_available` | Tìm task khả dụng cho agent | agentName, tags? | [task]
| `task_tree` | Xem cây task + summary | taskId | tree{subtasks,summary}
| `task_subtasks` | Danh sách subtasks trực tiếp | taskId | [task]
| `task_ancestors` | Tìm ancestors từ subtask | taskId | [task]
| `task_stats` | Thống kê số task theo status/priority | – | {counts}
| `task_server_info` | Thông tin server (phiên bản, capabilities, store location) | – | {version,capabilities,storeLocation,taskCount}

## 5. Ví dụ sử dụng
```javascript
// Manager tạo task
const t = await task_create({
  title: "Implement GET /api/v1/jobs",
  description: "Create endpoint with CQRS",
  priority: "high",
  tags: ["jobs","backend"]
});

// Worker tìm và claim
const avail = await task_find_available({agentName:"backend-worker",tags:["jobs"]});
await task_claim({taskId:avail[0].id,agentName:"backend-worker"});

// Nếu task lớn → subtask pattern
const sub = await task_create({title:"Jobs - Endpoints",parentTaskId:t.id,tags:t.tags});
await task_claim({taskId:sub.id,agentName:"backend-worker"});
// ...work...
await task_report({taskId:sub.id,summary:"Endpoints done"});
// repeat subtask creation until done, then report parent
await task_report({taskId:t.id,summary:"Jobs module completed"});
```

## 6. Ứng dụng thực tế (Coordinator/Worker)
- **Coordinator** (Manager/Lead) tạo task, theo dõi tiến độ bằng `task_list`, `task_tree`.
- **Worker** tự động `task_find_available` → `task_claim` → thực hiện → `task_report`.
- **Pattern**: lớn → tạo **subtask**, claim ngay, báo cáo, lặp → parent auto‑update progress.

## 7. Cấu trúc test
- `test.js` – unit tests cho từng tool.
- `createTask.test.js`, `claimTask.test.js` – kiểm tra luồng tạo‑claim‑report.
- `e2e-test.js` – khởi động server, giả lập full workflow (create → find → claim → report).
- Chạy: `npm test`.

## 8. Đóng góp
1. Fork repo.
2. Tạo branch `feature/<tên>`.
3. Thêm / sửa code, viết test.
4. `npm test` đảm bảo mọi test pass.
5. Commit theo Conventional Commits.
6. Tạo Pull Request, review bằng checklist (code‑review‑checklist).
7. Merge sau khi CI passes.

---
*Guide dựa trên README hiện có, duy trì phong cách markdown.*