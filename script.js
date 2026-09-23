"use strict";

const STORAGE_KEY = "homework-reminder-tasks";

const homeworkForm = document.getElementById("homeworkForm");
const homeworkTitle = document.getElementById("homeworkTitle");
const homeworkSubject = document.getElementById("homeworkSubject");
const homeworkDueDate = document.getElementById("homeworkDueDate");

const titleError = document.getElementById("titleError");
const subjectError = document.getElementById("subjectError");
const dateError = document.getElementById("dateError");

const tasksContainer = document.getElementById("tasksContainer");
const emptyState = document.getElementById("emptyState");

const pendingCount = document.getElementById("pendingCount");
const completedCount = document.getElementById("completedCount");

const filterButtons = document.querySelectorAll(".filter-button");
const toast = document.getElementById("toast");

let tasks = loadTasks();
let currentFilter = "all";
let toastTimeout = null;

/**
 * Returns today's date as a local calendar date at midnight.
 * Using local calendar components avoids UTC/time-zone conversion issues.
 */
function getToday() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Converts a YYYY-MM-DD input value into a local Date object.
 * The Date constructor must not receive the string directly because
 * that can interpret it as UTC and cause date shifts in some time zones.
 */
function parseLocalDate(dateString) {
  const parts = dateString.split("-").map(Number);

  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }

  const [year, month, day] = parts;

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Formats a Date object using the user's local locale.
 */
function formatDate(dateString) {
  const date = parseLocalDate(dateString);

  if (!date) {
    return "Invalid date";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Returns the number of complete calendar days between today
 * and the supplied due date.
 */
function getDaysRemaining(dateString) {
  const dueDate = parseLocalDate(dateString);
  const today = getToday();

  if (!dueDate) {
    return Number.POSITIVE_INFINITY;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.round((dueDate.getTime() - today.getTime()) / millisecondsPerDay);
}

/**
 * Determines the visual status of a task.
 *
 * Green: more than 5 days remaining
 * Yellow: 2 to 5 days remaining
 * Red: today or tomorrow
 * Blue: completed, regardless of deadline
 *
 * The form prevents new past dates, but the function also handles
 * old tasks safely if the date has passed after they were created.
 */
function getTaskStatus(task) {
  if (task.completed) {
    return {
      className: "status-blue",
      label: "Completed",
      remainingText: "Already delivered",
    };
  }

  const daysRemaining = getDaysRemaining(task.dueDate);

  if (daysRemaining <= 1) {
    return {
      className: "status-red",
      label: daysRemaining < 0 ? "Overdue" : "Due soon",
      remainingText:
        daysRemaining < 0
          ? `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} overdue`
          : daysRemaining === 0
            ? "Due today"
            : "Due tomorrow",
    };
  }

  if (daysRemaining <= 5) {
    return {
      className: "status-yellow",
      label: "Coming soon",
      remainingText: `${daysRemaining} days remaining`,
    };
  }

  return {
    className: "status-green",
    label: "On track",
    remainingText: `${daysRemaining} days remaining`,
  };
}

/**
 * Loads and validates saved tasks from localStorage.
 */
function loadTasks() {
  try {
    const storedTasks = localStorage.getItem(STORAGE_KEY);

    if (!storedTasks) {
      return [];
    }

    const parsedTasks = JSON.parse(storedTasks);

    if (!Array.isArray(parsedTasks)) {
      return [];
    }

    return parsedTasks
      .filter((task) => {
        return (
          task &&
          typeof task.id === "string" &&
          typeof task.title === "string" &&
          typeof task.subject === "string" &&
          typeof task.dueDate === "string" &&
          typeof task.completed === "boolean"
        );
      })
      .map((task) => ({
        id: task.id,
        title: task.title,
        subject: task.subject,
        dueDate: task.dueDate,
        completed: task.completed,
      }));
  } catch (error) {
    console.error("Could not load homework from localStorage:", error);
    return [];
  }
}

/**
 * Saves the current task state.
 */
function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.error("Could not save homework to localStorage:", error);
    showToast("Could not save your homework locally.");
  }
}

/**
 * Creates a unique task ID.
 */
function createTaskId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Escapes user-provided text before placing it into HTML.
 */
function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Returns the tasks allowed by the active filter.
 */
function getFilteredTasks() {
  if (currentFilter === "pending") {
    return tasks.filter((task) => !task.completed);
  }

  if (currentFilter === "completed") {
    return tasks.filter((task) => task.completed);
  }

  return [...tasks];
}

/**
 * Sorts pending tasks by deadline first and completed tasks afterwards.
 */
function sortTasks(taskList) {
  return [...taskList].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    const dateDifference =
      parseLocalDate(a.dueDate).getTime() - parseLocalDate(b.dueDate).getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return a.title.localeCompare(b.title);
  });
}

/**
 * Creates the HTML representation of one task.
 */
function createTaskHTML(task) {
  const status = getTaskStatus(task);
  const actionLabel = task.completed ? "Mark as pending" : "Mark as done";

  return `
        <article class="task-card ${status.className} ${task.completed ? "completed" : ""}" data-task-id="${escapeHTML(task.id)}">
            <div class="task-top">
                <span class="subject-badge" title="${escapeHTML(task.subject)}">
                    ${escapeHTML(task.subject)}
                </span>

                <button
                    type="button"
                    class="delete-button"
                    data-action="delete"
                    aria-label="Delete ${escapeHTML(task.title)}"
                    title="Delete homework"
                >
                    ×
                </button>
            </div>

            <h3 class="task-title">${escapeHTML(task.title)}</h3>

            <div class="task-meta">
                <div class="meta-row">
                    <span class="meta-label">Due date</span>
                    <span class="meta-value deadline-value">
                        ${escapeHTML(formatDate(task.dueDate))}
                    </span>
                </div>

                <div class="meta-row">
                    <span class="meta-label">Time remaining</span>
                    <span class="meta-value">
                        ${escapeHTML(status.remainingText)}
                    </span>
                </div>
            </div>

            <div class="task-footer">
                <span class="status-text">${escapeHTML(status.label)}</span>

                <button
                    type="button"
                    class="toggle-button"
                    data-action="toggle"
                    aria-label="${escapeHTML(actionLabel)} for ${escapeHTML(task.title)}"
                >
                    ${escapeHTML(actionLabel)}
                </button>
            </div>
        </article>
    `;
}

/**
 * Renders the complete task list and updates dashboard counters.
 */
function renderTasks() {
  const pending = tasks.filter((task) => !task.completed).length;
  const completed = tasks.filter((task) => task.completed).length;

  pendingCount.textContent = pending;
  completedCount.textContent = completed;

  const filteredTasks = sortTasks(getFilteredTasks());

  tasksContainer.innerHTML = filteredTasks.map(createTaskHTML).join("");

  if (filteredTasks.length === 0) {
    emptyState.classList.remove("hidden");

    if (tasks.length > 0) {
      const filterText = currentFilter === "pending" ? "pending" : "completed";

      emptyState.querySelector("h3").textContent = `No ${filterText} homework`;

      emptyState.querySelector("p").textContent =
        "Try another filter to see your other assignments.";
    } else {
      emptyState.querySelector("h3").textContent = "No homework yet";
      emptyState.querySelector("p").textContent =
        "Add your first assignment above and start organizing your workload.";
    }
  } else {
    emptyState.classList.add("hidden");
  }
}

/**
 * Clears validation errors from the form.
 */
function clearErrors() {
  titleError.textContent = "";
  subjectError.textContent = "";
  dateError.textContent = "";

  homeworkTitle.classList.remove("invalid");
  homeworkSubject.classList.remove("invalid");
  homeworkDueDate.classList.remove("invalid");
}

/**
 * Validates the form.
 */
function validateForm() {
  clearErrors();

  let isValid = true;

  const title = homeworkTitle.value.trim();
  const subject = homeworkSubject.value.trim();
  const dueDate = homeworkDueDate.value;
  const today = getToday();

  if (!title) {
    titleError.textContent = "Please enter a homework title.";
    homeworkTitle.classList.add("invalid");
    isValid = false;
  }

  if (!subject) {
    subjectError.textContent = "Please enter a subject.";
    homeworkSubject.classList.add("invalid");
    isValid = false;
  }

  const parsedDueDate = parseLocalDate(dueDate);

  if (!dueDate || !parsedDueDate) {
    dateError.textContent = "Please select a valid due date.";
    homeworkDueDate.classList.add("invalid");
    isValid = false;
  } else if (parsedDueDate < today) {
    dateError.textContent = "The due date cannot be in the past.";
    homeworkDueDate.classList.add("invalid");
    isValid = false;
  }

  return isValid;
}

/**
 * Adds a new homework task.
 */
function addTask(event) {
  event.preventDefault();

  if (!validateForm()) {
    return;
  }

  const newTask = {
    id: createTaskId(),
    title: homeworkTitle.value.trim(),
    subject: homeworkSubject.value.trim(),
    dueDate: homeworkDueDate.value,
    completed: false,
  };

  tasks.push(newTask);
  saveTasks();
  renderTasks();

  homeworkForm.reset();
  clearErrors();

  showToast("Homework added successfully.");
}

/**
 * Toggles a task between pending and completed.
 */
function toggleTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task) {
    return;
  }

  task.completed = !task.completed;

  saveTasks();
  renderTasks();

  showToast(
    task.completed
      ? "Homework marked as completed."
      : "Homework moved back to pending.",
  );
}

/**
 * Deletes a task after confirmation.
 */
function deleteTask(taskId) {
  const taskIndex = tasks.findIndex((item) => item.id === taskId);

  if (taskIndex === -1) {
    return;
  }

  const task = tasks[taskIndex];

  const confirmed = window.confirm(
    `Delete "${task.title}"? This action cannot be undone.`,
  );

  if (!confirmed) {
    return;
  }

  tasks.splice(taskIndex, 1);

  saveTasks();
  renderTasks();

  showToast("Homework deleted.");
}

/**
 * Handles task-card button actions using event delegation.
 */
function handleTaskAction(event) {
  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) {
    return;
  }

  const taskCard = actionButton.closest("[data-task-id]");

  if (!taskCard) {
    return;
  }

  const taskId = taskCard.dataset.taskId;
  const action = actionButton.dataset.action;

  if (action === "toggle") {
    toggleTask(taskId);
  }

  if (action === "delete") {
    deleteTask(taskId);
  }
}

/**
 * Changes the active task filter.
 */
function setFilter(filter) {
  currentFilter = filter;

  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === filter;

    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  renderTasks();
}

/**
 * Displays a temporary notification.
 */
function showToast(message) {
  window.clearTimeout(toastTimeout);

  toast.textContent = message;
  toast.classList.add("visible");
  toast.setAttribute("aria-hidden", "false");

  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("visible");
    toast.setAttribute("aria-hidden", "true");
  }, 2800);
}

/**
 * Sets the minimum selectable date to today.
 */
function setMinimumDate() {
  const today = getToday();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  homeworkDueDate.min = `${year}-${month}-${day}`;
}

/**
 * Re-renders periodically so deadline labels stay accurate
 * if the page remains open across midnight.
 */
function startDeadlineRefresh() {
  window.setInterval(() => {
    setMinimumDate();
    renderTasks();
  }, 60 * 1000);
}

homeworkForm.addEventListener("submit", addTask);
tasksContainer.addEventListener("click", handleTaskAction);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setFilter(button.dataset.filter);
  });
});

homeworkTitle.addEventListener("input", () => {
  if (homeworkTitle.value.trim()) {
    homeworkTitle.classList.remove("invalid");
    titleError.textContent = "";
  }
});

homeworkSubject.addEventListener("input", () => {
  if (homeworkSubject.value.trim()) {
    homeworkSubject.classList.remove("invalid");
    subjectError.textContent = "";
  }
});

homeworkDueDate.addEventListener("change", () => {
  const selectedDate = parseLocalDate(homeworkDueDate.value);

  if (selectedDate && selectedDate >= getToday()) {
    homeworkDueDate.classList.remove("invalid");
    dateError.textContent = "";
  }
});

setMinimumDate();
renderTasks();
startDeadlineRefresh();

const loginScreen = document.getElementById("loginScreen");
const loginUser = document.getElementById("loginUser");
const loginPassword = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");

loginButton.addEventListener("click", () => {
  if (loginUser.value.trim() && loginPassword.value.trim()) {
    loginScreen.style.display = "none";
  }
});

// Cole no final do seu arquivo script.js
document.addEventListener("DOMContentLoaded", function () {
  const visitorButton = document.getElementById("visitorButton");

  if (visitorButton) {
    visitorButton.addEventListener("click", function (e) {
      e.preventDefault();

      // Esconde a tela de login
      document.getElementById("loginScreen").style.display = "none";

      // Mostra a tela do projeto (substitua 'projectScreen' pelo ID real do seu painel)
      document.getElementById("projectScreen").style.display = "block";

      // Salva a sessão do visitante
      localStorage.setItem("userRole", "visitor");
    });
  }
});
