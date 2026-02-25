/**
 * Main entry point — wires up state, events, and modules.
 */
import './style.css';
import { getColorForDiscipline, resetColor, resetAllColors } from './data.js';
import { initGrid, renderGrid } from './grid.js';
import { initSidebar, renderDisciplineList } from './sidebar.js';

/**
 * App state: list of selected turmas.
 * Each entry: { codigo, nomeDisciplina, turma, horarios, professores }
 */
const selectedTurmas = [];

/** Get the current search query */
function getQuery() {
    return document.getElementById('search-input')?.value || '';
}

/**
 * Toggle a turma selection.
 */
function toggleTurma(discipline, turma) {
    const key = `${discipline.codigo}-${turma.turma}`;
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
    updateSelectedCount();
}

/**
 * Render selected discipline chips above the grid.
 */
function renderSelectedChips() {
    const container = document.getElementById('selected-chips');
    container.innerHTML = '';

    if (selectedTurmas.length === 0) return;

    for (const sel of selectedTurmas) {
        const color = getColorForDiscipline(sel.codigo);
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.style.background = color.bg;
        chip.style.borderColor = color.border;
        chip.style.color = color.text;
        chip.innerHTML = `
      <span>${sel.codigo} · T${sel.turma}</span>
      <span class="chip-remove">✕</span>
    `;
        chip.title = `${sel.nomeDisciplina}\nTurma ${sel.turma}\n${sel.professores.join(', ')}`;
        chip.addEventListener('click', () => removeTurma(sel.codigo, sel.turma));
        container.appendChild(chip);
    }
}

/**
 * Update the selected count badge.
 */
function updateSelectedCount() {
    const badge = document.getElementById('selected-count');
    const count = selectedTurmas.length;
    badge.textContent = `${count} selecionada${count !== 1 ? 's' : ''}`;
}

/**
 * Initialize the app.
 */
function init() {
    // Init grid
    initGrid((codigo, turma) => {
        removeTurma(codigo, turma);
    });

    // Init sidebar
    initSidebar({
        onToggle: toggleTurma,
        getSelected: () => selectedTurmas,
        onTabChange: () => {
            // Grid persists — just re-render the sidebar list
            renderDisciplineList('');
        },
    });

    // Clear all button
    document.getElementById('btn-clear-all').addEventListener('click', clearAll);

    // Initial render
    renderGrid([]);
    updateSelectedCount();
}

// Start
init();
