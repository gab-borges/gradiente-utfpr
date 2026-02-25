/**
 * Grid module — renders and manages the weekly schedule table.
 */
import { DAYS, DAY_LABELS, SHIFTS, TIME_MAP, slotKey, getColorForDiscipline } from './data.js';

/** @type {Map<string, {codigo: string, turma: string, sala: string}>} */
let occupiedSlots = new Map();

/** Callback when a grid slot is clicked */
let onSlotClick = null;
let previewTurma = null;

function clearPreviewSlots() {
    const previews = document.querySelectorAll('.grid-preview-slot');
    previews.forEach((node) => node.remove());
}

function renderPreviewSlots() {
    clearPreviewSlots();
    if (!previewTurma) return;

    const color = getColorForDiscipline(previewTurma.codigo);

    for (const h of previewTurma.horarios) {
        const key = slotKey(h);
        const [dia, turno, aula] = key.split('-');
        const cell = document.getElementById(`cell-${dia}-${turno}-${aula}`);
        if (!cell) continue;

        const entries = occupiedSlots.get(key) || [];
        const alreadyPlaced = entries.some(
            (entry) => entry.codigo === previewTurma.codigo && entry.turma === previewTurma.turma
        );
        if (alreadyPlaced) continue;

        const hasConflict = entries.some((entry) => entry.codigo !== previewTurma.codigo);

        const previewEl = document.createElement('div');
        previewEl.className = `grid-preview-slot${hasConflict ? ' conflict' : ''}`;
        previewEl.innerHTML = `<span class="slot-preview-code">${previewTurma.nomeDisciplina}</span>`;

        if (!hasConflict) {
            previewEl.style.background = color.bg;
            previewEl.style.borderColor = color.border;
            previewEl.style.color = color.text;
        }

        previewEl.title = `Preview: ${previewTurma.codigo} - Turma ${previewTurma.turma}`;
        cell.appendChild(previewEl);
    }
}

/**
 * Initialize the schedule grid table.
 */
export function initGrid(onSlotClickCb) {
    onSlotClick = onSlotClickCb;
    const table = document.getElementById('schedule-grid');
    table.innerHTML = '';

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const thCorner = document.createElement('th');
    thCorner.textContent = '';
    headerRow.appendChild(thCorner);

    for (const day of DAYS) {
        const th = document.createElement('th');
        th.textContent = DAY_LABELS[day];
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');

    for (let si = 0; si < SHIFTS.length; si++) {
        const shift = SHIFTS[si];

        // Add separator between shifts (not before first)
        if (si > 0) {
            const sepRow = document.createElement('tr');
            sepRow.className = 'shift-separator';
            for (let i = 0; i <= DAYS.length; i++) {
                sepRow.appendChild(document.createElement('td'));
            }
            tbody.appendChild(sepRow);
        }

        for (const slot of shift.slots) {
            const row = document.createElement('tr');
            const labelCell = document.createElement('td');
            const timeKey = `${shift.key}${slot}`;
            labelCell.innerHTML = `<span style="font-weight:600">${timeKey}</span><br/><span style="font-size:0.65rem;opacity:0.6">${TIME_MAP[timeKey] || ''}</span>`;
            row.appendChild(labelCell);

            for (const day of DAYS) {
                const td = document.createElement('td');
                td.id = `cell-${day}-${shift.key}-${slot}`;
                td.dataset.day = day;
                td.dataset.shift = shift.key;
                td.dataset.slot = slot;
                row.appendChild(td);
            }
            tbody.appendChild(row);
        }
    }

    table.appendChild(tbody);
}

/**
 * Update the grid with current selections.
 * @param {Array} selectedTurmas - [{codigo, nomeDisciplina, turma, horarios}]
 */
export function renderGrid(selectedTurmas) {
    // Clear all slots
    occupiedSlots.clear();
    const cells = document.querySelectorAll('#schedule-grid td[id^="cell-"]');
    cells.forEach((cell) => {
        cell.innerHTML = '';
    });

    // Build occupation map and detect conflicts
    const slotMap = new Map(); // slotKey -> [{codigo, turma, sala}]

    for (const sel of selectedTurmas) {
        for (const h of sel.horarios) {
            const key = slotKey(h);
            if (!slotMap.has(key)) slotMap.set(key, []);
            slotMap.get(key).push({
                codigo: sel.codigo,
                nomeDisciplina: sel.nomeDisciplina,
                turma: sel.turma,
                sala: h.sala,
            });
        }
    }

    // Render slots
    for (const [key, entries] of slotMap) {
        const [dia, turno, aula] = key.split('-');
        const cellId = `cell-${dia}-${turno}-${aula}`;
        const cell = document.getElementById(cellId);
        if (!cell) continue;

        const isConflict = entries.length > 1;

        for (const entry of entries) {
            const color = getColorForDiscipline(entry.codigo);
            const slotEl = document.createElement('div');
            slotEl.className = `grid-slot${isConflict ? ' conflict-slot' : ''}`;
            slotEl.style.background = isConflict
                ? 'rgba(252, 92, 124, 0.3)'
                : color.bg;
            slotEl.style.border = `1px solid ${isConflict ? '#fc5c7c' : color.border}`;
            slotEl.style.color = isConflict ? '#fda4af' : color.text;

            slotEl.innerHTML = `
        <span class="slot-code">${entry.nomeDisciplina}</span>
        ${entry.sala ? `<span class="slot-room">${entry.sala}</span>` : ''}
      `;

            slotEl.title = `${entry.codigo} - ${entry.nomeDisciplina}\nTurma ${entry.turma}${entry.sala ? `\nSala: ${entry.sala}` : ''}${isConflict ? '\n⚠ CONFLITO!' : ''}`;

            slotEl.addEventListener('click', () => {
                if (onSlotClick) onSlotClick(entry.codigo, entry.turma);
            });

            // If conflict, stack them
            if (isConflict) {
                const idx = entries.indexOf(entry);
                slotEl.style.position = 'absolute';
                slotEl.style.inset = '2px';
                if (entries.length === 2) {
                    slotEl.style[idx === 0 ? 'right' : 'left'] = '50%';
                }
            }

            cell.appendChild(slotEl);
        }

        occupiedSlots.set(key, entries);
    }

    renderPreviewSlots();
}

/**
 * Set or clear temporary preview slots from sidebar hover.
 */
export function setGridPreview(discipline, turma) {
    if (!discipline || !turma) {
        previewTurma = null;
        clearPreviewSlots();
        return;
    }

    previewTurma = {
        codigo: discipline.codigo,
        nomeDisciplina: discipline.nome,
        turma: turma.turma,
        horarios: turma.horarios,
    };

    renderPreviewSlots();
}

/**
 * Check if any of the given horarios conflict with currently occupied slots.
 * Returns array of conflicting slot keys.
 */
export function getConflicts(horarios, excludeCodigo) {
    const conflicts = [];
    for (const h of horarios) {
        const key = slotKey(h);
        if (occupiedSlots.has(key)) {
            const entries = occupiedSlots.get(key);
            const otherEntries = entries.filter((e) => e.codigo !== excludeCodigo);
            if (otherEntries.length > 0) {
                conflicts.push(key);
            }
        }
    }
    return conflicts;
}
