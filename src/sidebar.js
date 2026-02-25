/**
 * Sidebar module — course tabs, discipline search, listing, turma selection.
 */
import {
    COURSES,
    getActiveCourse,
    setActiveCourse,
    searchDisciplines,
    formatTurmaSchedule,
    getColorForDiscipline,
    slotKey,
} from './data.js';

let onTurmaToggle = null;
let getSelectedTurmas = null;
let onCourseChange = null;

/**
 * Initialize the sidebar.
 */
export function initSidebar({ onToggle, getSelected, onTabChange }) {
    onTurmaToggle = onToggle;
    getSelectedTurmas = getSelected;
    onCourseChange = onTabChange;

    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('btn-clear-search');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value;
        clearBtn.style.display = query ? 'block' : 'none';
        renderDisciplineList(query);
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        renderDisciplineList('');
        searchInput.focus();
    });

    renderCourseTabs();
    renderDisciplineList('');
}

/**
 * Render course tabs.
 */
function renderCourseTabs() {
    const container = document.getElementById('course-tabs');
    container.innerHTML = '';

    const activeCourse = getActiveCourse();

    for (const course of COURSES) {
        const tab = document.createElement('button');
        tab.className = `course-tab${course.id === activeCourse.id ? ' active' : ''}`;
        tab.dataset.courseId = course.id;
        tab.innerHTML = `
      <span class="tab-label">${course.label}</span>
      <span class="tab-count">${course.data.length}</span>
    `;

        tab.addEventListener('click', () => {
            if (course.id === getActiveCourse().id) return;
            setActiveCourse(course.id);
            renderCourseTabs();

            // Clear search on tab switch
            const searchInput = document.getElementById('search-input');
            const clearBtn = document.getElementById('btn-clear-search');
            searchInput.value = '';
            clearBtn.style.display = 'none';

            renderDisciplineList('');
            if (onCourseChange) onCourseChange(course.id);
        });

        container.appendChild(tab);
    }
}

/**
 * Render the discipline list in the sidebar.
 */
export function renderDisciplineList(query) {
    const container = document.getElementById('discipline-list');
    const results = searchDisciplines(query);

    if (results.length === 0) {
        container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <div class="no-results-text">Nenhuma disciplina encontrada</div>
      </div>
    `;
        return;
    }

    container.innerHTML = '';
    const selectedTurmas = getSelectedTurmas();
    const selectedKeys = new Set(
        selectedTurmas.map((s) => `${s.codigo}-${s.turma}`)
    );

    for (const disc of results) {
        const card = document.createElement('div');
        card.className = 'discipline-card';

        // Check if any turma of this discipline is selected
        const hasSelected = disc.turmas.some((t) =>
            selectedKeys.has(`${disc.codigo}-${t.turma}`)
        );
        if (hasSelected) card.classList.add('has-selected');

        // Header
        const header = document.createElement('div');
        header.className = 'discipline-header';
        header.innerHTML = `
      <span class="disc-code">${disc.codigo}</span>
      <span class="disc-name" title="${disc.nome}">${disc.nome}</span>
      <span class="disc-hours">${disc.aulasPresenciais}h</span>
      <span class="disc-expand-icon">▶</span>
    `;

        header.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });

        card.appendChild(header);

        // Turma list
        const turmaListEl = document.createElement('div');
        turmaListEl.className = 'turma-list';

        for (const turma of disc.turmas) {
            const turmaKey = `${disc.codigo}-${turma.turma}`;
            const isSelected = selectedKeys.has(turmaKey);
            const hasConflict = !isSelected && checkTurmaConflict(turma, disc.codigo);

            const item = document.createElement('div');
            item.className = `turma-item${isSelected ? ' selected' : ''}${hasConflict ? ' conflict' : ''}`;
            item.dataset.key = turmaKey;

            const scheduleStr = formatTurmaSchedule(turma);
            const profStr = turma.professores.join(', ') || 'Professor não definido';

            item.innerHTML = `
        <div class="turma-top">
          <span class="turma-code">Turma ${turma.turma} · ${turma.enquadramento}</span>
          <span class="turma-vagas">${turma.vagasTotal} vagas</span>
        </div>
        <div class="turma-schedule">${scheduleStr || 'Horário não definido'}</div>
        <div class="turma-professor">${profStr}</div>
        <div class="turma-conflict-msg">⚠ Conflito com disciplina já selecionada</div>
      `;

            if (isSelected) {
                const color = getColorForDiscipline(disc.codigo);
                item.style.borderColor = color.border;
                item.style.background = color.bg;
            }

            item.addEventListener('click', () => {
                if (onTurmaToggle) {
                    onTurmaToggle(disc, turma);
                }
            });

            turmaListEl.appendChild(item);
        }

        card.appendChild(turmaListEl);
        container.appendChild(card);
    }
}

/**
 * Check if a turma conflicts with currently selected turmas.
 */
function checkTurmaConflict(turma, codigo) {
    const selectedTurmas = getSelectedTurmas();
    for (const h of turma.horarios) {
        const key = slotKey(h);
        for (const sel of selectedTurmas) {
            if (sel.codigo === codigo) continue;
            for (const sh of sel.horarios) {
                if (slotKey(sh) === key) return true;
            }
        }
    }
    return false;
}
