class Todo {
    constructor() {
        this.storageKey = "todo-tasks";
        this.tasks = this.loadTasks();
        this.selectedIds = new Set();
        this.searchTerm = "";
        this.editingId = null;

        this.searchInput = document.querySelector("#task-search");
        this.taskList = document.querySelector("#task-list");
        this.newTaskForm = document.querySelector("#new-task-form");
        this.newTaskTitle = document.querySelector("#new-task-title");
        this.newTaskDate = document.querySelector("#new-task-date");
        this.deleteSelectedButton = document.querySelector("#delete-selected");
        this.selectedCount = document.querySelector("#selected-count");
        this.selectAllCheckbox = document.querySelector("#select-all");
        this.todoCard = document.querySelector(".todo-card");
        this.dragHandle = document.querySelector(".todo-drag-handle");

        this.bindEvents();
        this.initializeDragging();
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
        );
    }

    bindEvents() {
        let dragStart = null;
        this.dragHandle.addEventListener("pointerdown", event => {
            if (event.button !== 0) {
                return;
            }
            const rect = this.todoCard.getBoundingClientRect();
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
            this.positionCard(
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
                const rect = this.todoCard.getBoundingClientRect();
                this.positionCard(rect.left + offset[0], rect.top + offset[1]);
            }
        });

        this.searchInput.addEventListener("input", () => {
            this.searchTerm = this.searchInput.value.trim();
            this.render();
        });

        this.newTaskForm.addEventListener("submit", event => {
            event.preventDefault();
            const title = this.newTaskTitle.value.trim();
            if (!title) {
                this.newTaskTitle.setCustomValidity("Enter a task name.");
                this.newTaskTitle.reportValidity();
                return;
            }

            this.addTask(title, this.newTaskDate.value);
            this.newTaskForm.reset();
            this.newTaskTitle.focus();
        });

        this.newTaskTitle.addEventListener("input", () => this.newTaskTitle.setCustomValidity(""));

        this.taskList.addEventListener("change", event => {
            if (event.target.matches("[data-task-checkbox]")) {
                const { taskId } = event.target.dataset;
                if (event.target.checked) {
                    this.selectedIds.add(taskId);
                } else {
                    this.selectedIds.delete(taskId);
                }
                this.updateSelectionControls();
            }
        });

        this.taskList.addEventListener("click", event => {
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

            const taskName = event.target.closest("[data-task-name]");
            if (taskName) {
                this.startEdit(taskName.dataset.taskId);
            }
        });

        this.taskList.addEventListener("keydown", event => {
            if (!event.target.matches("[data-edit-input]")) {
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                this.saveEdit(event.target.dataset.taskId);
            } else if (event.key === "Escape") {
                this.cancelEdit();
            }
        });

        this.deleteSelectedButton.addEventListener("click", () => {
            this.deleteTasks(this.selectedIds);
        });

        this.selectAllCheckbox.addEventListener("change", () => {
            const visibleIds = this.visibleTasks().map(task => task.id);
            if (this.selectAllCheckbox.checked) {
                visibleIds.forEach(id => this.selectedIds.add(id));
            } else {
                visibleIds.forEach(id => this.selectedIds.delete(id));
            }
            this.render();
        });
    }

    initializeDragging() {
        const rect = this.todoCard.getBoundingClientRect();
        this.todoCard.classList.add("is-draggable");
        this.todoCard.style.left = `${rect.left}px`;
        this.todoCard.style.top = `${rect.top}px`;
    }

    positionCard(left, top) {
        const rect = this.todoCard.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        this.todoCard.style.left = `${Math.min(Math.max(left, margin), maxLeft)}px`;
        this.todoCard.style.top = `${Math.min(Math.max(top, margin), maxTop)}px`;
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

        this.updateSelectionControls();
    }

    createTaskRow(task) {
        const item = document.createElement("li");
        item.className = "list-group-item task-row d-flex align-items-center gap-3 px-1 py-3";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input task-checkbox flex-shrink-0";
        checkbox.checked = this.selectedIds.has(task.id);
        checkbox.dataset.taskCheckbox = "";
        checkbox.dataset.taskId = task.id;
        checkbox.setAttribute("aria-label", `Select ${task.title}`);
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
            this.appendHighlightedText(name, task.title);
            content.append(name);

            const date = document.createElement("time");
            date.className = "task-date d-block small text-secondary mt-1";
            date.dateTime = task.date;
            date.textContent = task.date;
            content.append(date);
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
        input.maxLength = 200;
        input.required = true;
        input.dataset.editInput = "";
        input.dataset.taskId = task.id;
        input.setAttribute("aria-label", "Edit task name");
        input.addEventListener("input", () => input.setCustomValidity(""));
        editor.append(input);

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

    addTask(title, date) {
        const normalizedTitle = title.trim();
        if (!normalizedTitle) {
            throw new Error("Task title cannot be empty.");
        }
        if (!date) {
            throw new Error("Task date is required.");
        }

        this.tasks.push({
            id: crypto.randomUUID(),
            title: normalizedTitle,
            date
        });
        this.persist();
        this.render();
    }

    saveEdit(taskId) {
        const input = Array.from(this.taskList.querySelectorAll("[data-edit-input]"))
            .find(editInput => editInput.dataset.taskId === taskId);
        if (!input) {
            throw new Error(`Cannot find editor for task: ${taskId}`);
        }
        const title = input.value.trim();
        if (!title) {
            input.setCustomValidity("Task name cannot be empty.");
            input.reportValidity();
            return;
        }

        const task = this.tasks.find(item => item.id === taskId);
        if (!task) {
            throw new Error(`Cannot edit missing task: ${taskId}`);
        }
        task.title = title;
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
        idsToDelete.forEach(id => this.selectedIds.delete(id));
        if (idsToDelete.has(this.editingId)) {
            this.editingId = null;
        }
        this.persist();
        this.render();
    }

    updateSelectionControls() {
        const visibleIds = this.visibleTasks().map(task => task.id);
        const selectedVisibleCount = visibleIds.filter(id => this.selectedIds.has(id)).length;
        this.selectedCount.textContent = `(${this.selectedIds.size})`;
        this.deleteSelectedButton.disabled = this.selectedIds.size === 0;
        this.selectAllCheckbox.disabled = visibleIds.length === 0;
        this.selectAllCheckbox.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
        this.selectAllCheckbox.indeterminate = selectedVisibleCount > 0 &&
            selectedVisibleCount < visibleIds.length;
    }

    persist() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.tasks));
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.todo = new Todo();
});