/**
 * Main entry point — wires up state, events, and modules.
 */
import './style.css';
import {
    COURSES,
    getActiveCourse,
    getColorForDiscipline,
    loadCourseDisciplines,
    resetColor,
    resetAllColors,
    setActiveCourse
} from './data.js';
import { initGrid, renderGrid, setGridPreview } from './grid.js';
import { initSidebar, renderDisciplineList } from './sidebar.js';
import { escapeHtml } from './sanitize.js';

/**
 * App state: list of selected turmas.
 * Each entry: { codigo, nomeDisciplina, turma, horarios, professores }
 */
const selectedTurmas = [];
const APP_STATE_KEY = 'gradiente-app-state-v1';

function saveAppState() {
    try {
        const state = {
            selectedTurmas,
            activeCourseId: getActiveCourse()?.id || 'computacao',
            searchQuery: getQuery(),
        };
        localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
    } catch {
        // Ignore storage errors (private mode/quota)
    }
}

function loadAppState() {
    try {
        const raw = localStorage.getItem(APP_STATE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function restoreSelectedTurmas(items) {
    if (!Array.isArray(items)) return;
    selectedTurmas.length = 0;

    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        if (item.codigo == null || item.nomeDisciplina == null || item.turma == null) continue;
        if (!Array.isArray(item.horarios)) continue;
        if (typeof item.turma !== 'string' && typeof item.turma !== 'number') continue;

        selectedTurmas.push({
            codigo: String(item.codigo),
            nomeDisciplina: String(item.nomeDisciplina),
            turma: item.turma,
            horarios: item.horarios,
            professores: Array.isArray(item.professores) ? item.professores : [],
        });
    }
}

/** Get the current search query */
function getQuery() {
    return document.getElementById('search-input')?.value || '';
}

/**
 * Toggle a turma selection.
 */
function toggleTurma(discipline, turma) {
    const existingIndex = selectedTurmas.findIndex(
        (s) => s.codigo === discipline.codigo && s.turma === turma.turma
    );

    if (existingIndex >= 0) {
        // Deselect
        selectedTurmas.splice(existingIndex, 1);
        // If no other turma from this discipline is selected, reset color
        const hasOther = selectedTurmas.some(
            (s) => s.codigo === discipline.codigo
        );
        if (!hasOther) resetColor(discipline.codigo);
    } else {
        // Deselect any other turma from the same discipline
        const sameDiscIdx = selectedTurmas.findIndex(
            (s) => s.codigo === discipline.codigo
        );
        if (sameDiscIdx >= 0) {
            selectedTurmas.splice(sameDiscIdx, 1);
        }

        // Select
        selectedTurmas.push({
            codigo: discipline.codigo,
            nomeDisciplina: discipline.nome,
            turma: turma.turma,
            horarios: turma.horarios,
            professores: turma.professores,
        });
    }

    updateUI();
}

/**
 * Remove a turma by clicking on a chip or grid slot.
 */
function removeTurma(codigo, turmaCode) {
    const idx = selectedTurmas.findIndex(
        (s) => s.codigo === codigo && s.turma === turmaCode
    );
    if (idx >= 0) {
        selectedTurmas.splice(idx, 1);
        const hasOther = selectedTurmas.some((s) => s.codigo === codigo);
        if (!hasOther) resetColor(codigo);
        updateUI();
    }
}

/**
 * Clear all selections.
 */
function clearAll() {
    selectedTurmas.length = 0;
    resetAllColors();
    updateUI();
}

/**
 * Update all UI components.
 */
function updateUI() {
    renderGrid(selectedTurmas);
    renderDisciplineList(getQuery());
    renderSelectedChips();
    updateInsights();
    updateFooterTimestamp();
    saveAppState();
}

/**
 * Render selected discipline chips above the grid.
 */
function renderSelectedChips() {
    const container = document.getElementById('selected-chips');
    container.innerHTML = '';

    if (selectedTurmas.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'chips-empty';
        empty.textContent = 'Nenhuma turma selecionada. Use a busca para começar.';
        container.appendChild(empty);
        return;
    }

    for (const sel of selectedTurmas) {
        const color = getColorForDiscipline(sel.codigo);
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.style.background = color.bg;
        chip.style.borderColor = color.border;
        chip.style.color = color.text;
        chip.innerHTML = `
      <span>${escapeHtml(sel.codigo)} · T${escapeHtml(sel.turma)}</span>
      <span class="chip-remove">✕</span>
    `;
        chip.title = `${sel.nomeDisciplina}\nTurma ${sel.turma}\n${sel.professores.join(', ')}`;
        chip.addEventListener('click', () => removeTurma(sel.codigo, sel.turma));
        container.appendChild(chip);
    }
}

/**
 * Compute and render dashboard metrics.
 */
function updateInsights() {
    const metricDisciplines = document.getElementById('metric-disciplines');
    const metricSlots = document.getElementById('metric-slots');
    let totalSlots = 0;

    for (const sel of selectedTurmas) {
        for (const horario of sel.horarios) {
            totalSlots++;
        }
    }

    metricDisciplines.textContent = String(selectedTurmas.length);
    metricSlots.textContent = String(totalSlots);
}

/**
 * Update footer timestamp with last interaction time.
 */
function updateFooterTimestamp() {
    const label = document.getElementById('footer-updated');
    const time = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date());
    label.textContent = `Atualizado às ${time}`;
}

function isDarkReaderActive() {
    const root = document.documentElement;
    return root.hasAttribute('data-darkreader-mode')
        || root.hasAttribute('data-darkreader-scheme')
        || Boolean(document.querySelector('style#dark-reader-style, style.darkreader'));
}

function applyDarkReaderThemeGuard() {
    const current = document.documentElement.dataset.theme || 'dark';
    if (current !== 'dark' || !isDarkReaderActive()) return false;
    document.documentElement.dataset.theme = 'light';
    localStorage.setItem('gradiente-theme', 'light');
    return true;
}

/**
 * Initialize theme toggle.
 */
function initThemeToggle() {
    const btn = document.getElementById('btn-theme-toggle');
    btn.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme;
        const next = current === 'dark' ? 'light' : 'dark';
        const resolvedTheme = next === 'dark' && isDarkReaderActive() ? 'light' : next;
        document.documentElement.dataset.theme = resolvedTheme;
        localStorage.setItem('gradiente-theme', resolvedTheme);
        updateUI();
    });
}

/**
 * Keyboard shortcuts:
 * "/" focuses search, "Esc" clears search when focused.
 */
function initKeyboardShortcuts() {
    window.addEventListener('keydown', (event) => {
        const searchInput = document.getElementById('search-input');
        const clearBtn = document.getElementById('btn-clear-search');
        const activeTag = document.activeElement?.tagName;
        const isTypingContext = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

        if (event.key === '/' && !isTypingContext) {
            event.preventDefault();
            searchInput.focus();
            return;
        }

        if (event.key === 'Escape' && document.activeElement === searchInput && searchInput.value) {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            renderDisciplineList('');
        }
    });
}

/**
 * Initialize the app.
 */
async function init() {
    applyDarkReaderThemeGuard();

    const persistedState = loadAppState();
    const savedCourseId = persistedState?.activeCourseId;
    if (typeof savedCourseId === 'string' && COURSES.some((course) => course.id === savedCourseId)) {
        setActiveCourse(savedCourseId);
    }
    restoreSelectedTurmas(persistedState?.selectedTurmas);

    // Init theme toggle
    initThemeToggle();
    initKeyboardShortcuts();

    // Init grid
    initGrid((codigo, turma) => {
        removeTurma(codigo, turma);
    });

    // Init sidebar
    initSidebar({
        onToggle: toggleTurma,
        getSelected: () => selectedTurmas,
        onTabChange: async () => {
            renderDisciplineList('');
            await loadCourseDisciplines(getActiveCourse().id);
            renderDisciplineList(getQuery());
            saveAppState();
        },
        onHover: (discipline, turma) => {
            setGridPreview(discipline, turma);
        },
    });

    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('btn-clear-search');
    searchInput.addEventListener('input', saveAppState);
    clearSearchBtn.addEventListener('click', saveAppState);

    const savedQuery = typeof persistedState?.searchQuery === 'string'
        ? persistedState.searchQuery
        : '';
    if (savedQuery) {
        searchInput.value = savedQuery;
        clearSearchBtn.style.display = 'block';
        renderDisciplineList(savedQuery);
    }

    // Clear all button
    document.getElementById('btn-clear-all').addEventListener('click', clearAll);

    // Initial render
    updateUI();

    // Preload all courses so tab counters do not stay as "…" until each tab is opened.
    await Promise.all(COURSES.map((course) => loadCourseDisciplines(course.id)));
    renderDisciplineList(getQuery());
}

// Start
init().catch((error) => {
    // Keep a visible failure in console without breaking module loading.
    console.error('Falha ao inicializar o Gradiente:', error);
});
