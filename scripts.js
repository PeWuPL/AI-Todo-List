class Window {
    constructor(element, dragHandle) {
        this.element = element;
        this.dragHandle = dragHandle;
        this.initializeDragging();
        this.bindDragEvents();
    }

    bindDragEvents() {
        let dragStart = null;
        this.dragHandle.addEventListener("pointerdown", event => {
            if (event.button !== 0) {
                return;
            }
            const rect = this.element.getBoundingClientRect();
            dragStart = {
                pointerX: event.clientX,
                pointerY: event.clientY,
                left: rect.left,
                top: rect.top
            };
            this.dragHandle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        this.dragHandle.addEventListener("pointermove", event => {
            if (!dragStart) {
                return;
            }
            this.position(
                dragStart.left + event.clientX - dragStart.pointerX,
                dragStart.top + event.clientY - dragStart.pointerY
            );
        });

        const stopDragging = () => {
            dragStart = null;
        };
        this.dragHandle.addEventListener("pointerup", stopDragging);
        this.dragHandle.addEventListener("pointercancel", stopDragging);
        this.dragHandle.addEventListener("lostpointercapture", stopDragging);
        this.dragHandle.addEventListener("keydown", event => {
            const offsets = {
                ArrowUp: [0, -10],
                ArrowDown: [0, 10],
                ArrowLeft: [-10, 0],
                ArrowRight: [10, 0]
            };
            const offset = offsets[event.key];
            if (offset) {
                event.preventDefault();
                const rect = this.element.getBoundingClientRect();
                this.position(rect.left + offset[0], rect.top + offset[1]);
            }
        });
    }

    initializeDragging() {
        const rect = this.element.getBoundingClientRect();
        this.element.classList.add("is-draggable");
        this.position(rect.left, rect.top);
    }

    position(left, top) {
        const rect = this.element.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        this.element.style.left = `${Math.min(Math.max(left, margin), maxLeft)}px`;
        this.element.style.top = `${Math.min(Math.max(top, margin), maxTop)}px`;
    }
}

function todayAsISODate() {
    const today = new Date();
    return [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0")
    ].join("-");
}

function isValidTaskDate(date) {
    if (!date) {
        return true;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayAsISODate()) {
        return false;
    }

    const [year, month, day] = date.split("-").map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    return parsedDate.getUTCFullYear() === year &&
        parsedDate.getUTCMonth() === month - 1 &&
        parsedDate.getUTCDate() === day;
}

class Todo extends Window {
    constructor() {
        const todoCard = document.querySelector(".todo-card");
        const dragHandle = document.querySelector(".todo-drag-handle");
        super(todoCard, dragHandle);

        this.storageKey = "todo-tasks";
        this.tasks = this.loadTasks();
        this.searchTerm = "";
        this.editingId = null;

        this.searchInput = document.querySelector("#task-search");
        this.taskList = document.querySelector("#task-list");
        this.newTaskForm = document.querySelector("#new-task-form");
        this.newTaskTitle = document.querySelector("#new-task-title");
        this.newTaskDate = document.querySelector("#new-task-date");
        this.newTaskDate.min = todayAsISODate();
        this.bindEvents();
        this.render();
    }

    loadTasks() {
        const storedTasks = localStorage.getItem(this.storageKey);
        if (storedTasks === null) {
            return [];
        }

        let parsedTasks;
        try {
            parsedTasks = JSON.parse(storedTasks);
        } catch (error) {
            if (error instanceof SyntaxError) {
                console.warn("Saved tasks were invalid JSON; starting with an empty list.", error);
                return [];
            }
            throw error;
        }

        if (!Array.isArray(parsedTasks)) {
            console.warn("Saved tasks were not a list; starting with an empty list.");
            return [];
        }

        return parsedTasks.filter(task =>
            task !== null &&
            typeof task.id === "string" &&
            typeof task.title === "string" &&
            typeof task.date === "string"
        ).map(task => ({ ...task, done: task.done === true }));
    }

    bindEvents() {
        this.searchInput.addEventListener("input", () => {
            const query = this.searchInput.value.trim();
            this.searchTerm = query.length >= 2 ? query : "";
            this.render();
        });

        this.newTaskForm.addEventListener("submit", event => {
            event.preventDefault();
            const title = this.newTaskTitle.value.trim();
            if (title.length < 3 || title.length > 255) {
                this.newTaskTitle.setCustomValidity("Task name must be between 3 and 255 characters.");
                this.newTaskTitle.reportValidity();
                return;
            }
            if (!isValidTaskDate(this.newTaskDate.value)) {
                this.newTaskDate.setCustomValidity("Choose today or a future date, or leave the date empty.");
                this.newTaskDate.reportValidity();
                return;
            }

            this.addTask(title, this.newTaskDate.value);
            this.newTaskForm.reset();
            this.newTaskTitle.focus();
        });

        this.newTaskTitle.addEventListener("input", () => this.newTaskTitle.setCustomValidity(""));
        this.newTaskDate.addEventListener("input", () => this.newTaskDate.setCustomValidity(""));

        this.taskList.addEventListener("change", event => {
            if (event.target.matches("[data-task-done]")) {
                this.setTaskDone(event.target.dataset.taskId, event.target.checked);
            }
        });

        this.taskList.addEventListener("click", event => {
            const taskName = event.target.closest("[data-task-name]");
            if (taskName) {
                this.startEdit(taskName.dataset.taskId);
                return;
            }

            const actionButton = event.target.closest("[data-action]");
            if (actionButton) {
                const { action, taskId } = actionButton.dataset;
                if (action === "delete") {
                    this.deleteTasks(new Set([taskId]));
                } else if (action === "save") {
                    this.saveEdit(taskId);
                } else if (action === "cancel") {
                    this.cancelEdit();
                }
                return;
            }

            if (event.target.closest("[data-task-done], [data-edit-field]")) {
                return;
            }

            const row = event.target.closest(".task-row");
            if (row) {
                const checkbox = row.querySelector("[data-task-done]");
                this.setTaskDone(checkbox.dataset.taskId, !checkbox.checked);
            }
        });

        this.taskList.addEventListener("keydown", event => {
            if (!event.target.matches("[data-edit-field]")) {
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                this.saveEdit(event.target.dataset.taskId);
            } else if (event.key === "Escape") {
                this.cancelEdit();
            }
        });

    }

    visibleTasks() {
        const query = this.searchTerm.toLocaleLowerCase();
        if (!query) {
            return this.tasks;
        }
        return this.tasks.filter(task => task.title.toLocaleLowerCase().includes(query));
    }

    render() {
        this.taskList.replaceChildren();
        const tasks = this.visibleTasks();

        if (tasks.length === 0) {
            const emptyMessage = document.createElement("li");
            emptyMessage.className = "list-group-item text-center text-secondary py-4";
            emptyMessage.textContent = this.searchTerm
                ? "No tasks match your search."
                : "No tasks yet. Add one below to get started.";
            this.taskList.append(emptyMessage);
        } else {
            tasks.forEach(task => this.taskList.append(this.createTaskRow(task)));
        }

    }

    createTaskRow(task) {
        const item = document.createElement("li");
        item.className = "list-group-item task-row d-flex align-items-center gap-3 px-1 py-3";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input task-checkbox flex-shrink-0";
        checkbox.checked = task.done;
        checkbox.dataset.taskDone = "";
        checkbox.dataset.taskId = task.id;
        checkbox.setAttribute("aria-label", `Mark ${task.title} as done`);
        item.append(checkbox);

        const content = document.createElement("div");
        content.className = "task-content flex-grow-1 min-width-0";
        if (this.editingId === task.id) {
            content.append(this.createEditor(task));
        } else {
            const name = document.createElement("button");
            name.type = "button";
            name.className = "task-name btn btn-link text-start text-decoration-none p-0";
            name.dataset.taskName = "";
            name.dataset.taskId = task.id;
            name.setAttribute("aria-label", `Edit task: ${task.title}`);
            const taskText = document.createElement("span");
            taskText.className = "task-name-text";
            this.appendHighlightedText(taskText, task.title);
            name.append(taskText);
            if (task.done) {
                name.classList.add("task-done");
            }
            content.append(name);

            if (task.date) {
                const date = document.createElement("time");
                date.className = "task-date d-block small text-secondary mt-1";
                date.dateTime = task.date;
                date.textContent = task.date;
                content.append(date);
            }
        }
        item.append(content);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn btn-outline-danger btn-sm flex-shrink-0";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.taskId = task.id;
        deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
        deleteButton.textContent = "Delete";
        item.append(deleteButton);

        return item;
    }

    createEditor(task) {
        const editor = document.createElement("div");
        editor.className = "d-flex flex-wrap gap-2";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "form-control form-control-sm task-edit-input flex-grow-1";
        input.value = task.title;
        input.minLength = 3;
        input.maxLength = 255;
        input.required = true;
        input.dataset.editField = "";
        input.dataset.taskId = task.id;
        input.setAttribute("aria-label", "Edit task name");
        input.addEventListener("input", () => input.setCustomValidity(""));
        editor.append(input);

        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.className = "form-control form-control-sm task-edit-date";
        dateInput.value = task.date;
        dateInput.min = todayAsISODate();
        dateInput.dataset.editField = "";
        dateInput.dataset.taskId = task.id;
        dateInput.setAttribute("aria-label", "Edit task date");
        dateInput.addEventListener("input", () => dateInput.setCustomValidity(""));
        editor.append(dateInput);

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "btn btn-success btn-sm";
        saveButton.dataset.action = "save";
        saveButton.dataset.taskId = task.id;
        saveButton.textContent = "Save";
        editor.append(saveButton);

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "btn btn-outline-secondary btn-sm";
        cancelButton.dataset.action = "cancel";
        cancelButton.textContent = "Cancel";
        editor.append(cancelButton);

        requestAnimationFrame(() => input.focus());
        return editor;
    }

    appendHighlightedText(element, title) {
        const query = this.searchTerm;
        if (!query) {
            element.textContent = title;
            return;
        }

        const lowerTitle = title.toLocaleLowerCase();
        const lowerQuery = query.toLocaleLowerCase();
        let cursor = 0;
        let matchIndex = lowerTitle.indexOf(lowerQuery, cursor);
        while (matchIndex !== -1) {
            element.append(document.createTextNode(title.slice(cursor, matchIndex)));
            const highlight = document.createElement("mark");
            highlight.textContent = title.slice(matchIndex, matchIndex + query.length);
            element.append(highlight);
            cursor = matchIndex + query.length;
            matchIndex = lowerTitle.indexOf(lowerQuery, cursor);
        }
        element.append(document.createTextNode(title.slice(cursor)));
    }

    startEdit(taskId) {
        this.editingId = taskId;
        this.render();
    }

    setTaskDone(taskId, done) {
        const task = this.tasks.find(item => item.id === taskId);
        if (!task) {
            throw new Error(`Cannot find task: ${taskId}`);
        }
        task.done = done;
        this.persist();
        this.render();
    }

    addTask(title, date) {
        const normalizedTitle = title.trim();
        const normalizedDate = date || "";
        if (normalizedTitle.length < 3 || normalizedTitle.length > 255) {
            throw new Error("Task title must be between 3 and 255 characters.");
        }
        if (!isValidTaskDate(normalizedDate)) {
            throw new Error("Task date must be today, a future date, or empty.");
        }

        this.tasks.push({
            id: crypto.randomUUID(),
            title: normalizedTitle,
            date: normalizedDate,
            done: false
        });
        this.persist();
        this.render();
    }

    saveEdit(taskId) {
        const fields = Array.from(this.taskList.querySelectorAll("[data-edit-field]"))
            .filter(field => field.dataset.taskId === taskId);
        const input = fields.find(field => field.type === "text");
        const dateInput = fields.find(field => field.type === "date");
        if (!input) {
            throw new Error(`Cannot find editor for task: ${taskId}`);
        }
        const title = input.value.trim();
        if (title.length < 3 || title.length > 255) {
            input.setCustomValidity("Task name must be between 3 and 255 characters.");
            input.reportValidity();
            return;
        }
        if (!dateInput) {
            throw new Error(`Cannot find date editor for task: ${taskId}`);
        }
        if (!isValidTaskDate(dateInput.value)) {
            dateInput.setCustomValidity("Choose today or a future date, or leave the date empty.");
            dateInput.reportValidity();
            return;
        }

        const task = this.tasks.find(item => item.id === taskId);
        if (!task) {
            throw new Error(`Cannot edit missing task: ${taskId}`);
        }
        task.title = title;
        task.date = dateInput.value;
        this.editingId = null;
        this.persist();
        this.render();
    }

    cancelEdit() {
        this.editingId = null;
        this.render();
    }

    deleteTasks(ids) {
        const idsToDelete = new Set(ids);
        this.tasks = this.tasks.filter(task => !idsToDelete.has(task.id));
        if (idsToDelete.has(this.editingId)) {
            this.editingId = null;
        }
        this.persist();
        this.render();
    }

    persist() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.tasks));
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.todo = new Todo();
});