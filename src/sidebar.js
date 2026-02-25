/**
 * Sidebar module — course tabs, discipline search, listing, turma selection.
 */
import {
    COURSES,
    getActiveCourse,
    getCourseLoadState,
    setActiveCourse,
    searchDisciplines,
    formatTurmaSchedule,
    getColorForDiscipline,
    slotKey,
} from './data.js';
import { escapeHtml } from './sanitize.js';

let onTurmaToggle = null;
let getSelectedTurmas = null;
let onCourseChange = null;
let onTurmaHover = null;
const expandedDisciplines = new Set();
const sidebarNavMeta = new Map();
let activeSidebarKey = null;
let courseFilterQuery = '';
let shouldRestoreCourseSearchFocusFromTab = false;

function normalizeText(str) {
    return String(str ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function getFilteredCourses() {
    const query = normalizeText(courseFilterQuery.trim());
    if (!query) return COURSES;

    return COURSES.filter(
        (course) =>
            normalizeText(course.label).includes(query) ||
            normalizeText(course.id).includes(query)
    );
}

function setCourseFilterQuery(value) {
    courseFilterQuery = String(value ?? '');

    const courseSearchInput = document.getElementById('course-search-input');
    const clearCourseSearchBtn = document.getElementById('btn-clear-course-search');
    if (courseSearchInput && courseSearchInput.value !== courseFilterQuery) {
        courseSearchInput.value = courseFilterQuery;
    }
    if (clearCourseSearchBtn) {
        clearCourseSearchBtn.style.display = courseFilterQuery ? 'block' : 'none';
    }
}

function focusCourseSearchInput(select = false) {
    const input = document.getElementById('course-search-input');
    if (!input) return;
    input.focus();
    if (select) input.select();
}

function focusDisciplineSearchInput(select = false) {
    const input = document.getElementById('search-input');
    if (!input) return;
    input.focus();
    if (select) input.select();
}

function getCourseTabButtons() {
    return Array.from(document.querySelectorAll('#course-tabs .course-tab'));
}

function scrollTabIntoView(tab, { behavior = 'smooth' } = {}) {
    const container = document.getElementById('course-tabs');
    if (!container || !tab) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const margin = 8;

    if (tabRect.left < containerRect.left + margin) {
        container.scrollBy({
            left: tabRect.left - containerRect.left - margin,
            behavior,
        });
        return;
    }

    if (tabRect.right > containerRect.right - margin) {
        container.scrollBy({
            left: tabRect.right - containerRect.right + margin,
            behavior,
        });
    }
}

function ensureActiveCourseTabVisible({ behavior = 'auto' } = {}) {
    const tabs = getCourseTabButtons();
    if (tabs.length === 0) return;

    const activeCourseId = getActiveCourse().id;
    const activeTab = tabs.find((tab) => tab.dataset.courseId === activeCourseId);
    if (!activeTab) return;
    scrollTabIntoView(activeTab, { behavior });
}

function bindCourseTabsWheelScroll() {
    const container = document.getElementById('course-tabs');
    if (!container || container.dataset.wheelBound === '1') return;

    container.addEventListener(
        'wheel',
        (event) => {
            // Convert vertical wheel into horizontal tab scrolling.
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            container.scrollLeft += event.deltaY;
            event.preventDefault();
        },
        { passive: false }
    );

    container.dataset.wheelBound = '1';
}

function bindQuickTipsToggle() {
    const toggleBtn = document.getElementById('btn-toggle-quick-tips');
    const content = document.getElementById('quick-tips-lines');
    if (!toggleBtn || !content || toggleBtn.dataset.bound === '1') return;

    const setExpanded = (isExpanded) => {
        toggleBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        content.hidden = !isExpanded;
    };

    // Default: expanded.
    setExpanded(true);

    toggleBtn.addEventListener('click', () => {
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setExpanded(!expanded);
    });

    toggleBtn.dataset.bound = '1';
}

function focusActiveCourseTab() {
    const tabs = getCourseTabButtons();
    if (tabs.length === 0) {
        focusCourseSearchInput();
        return;
    }

    const activeCourseId = getActiveCourse().id;
    const targetTab = tabs.find((tab) => tab.dataset.courseId === activeCourseId) || tabs[0];
    targetTab.focus();
    scrollTabIntoView(targetTab, { behavior: 'smooth' });
}

function syncCourseTabCounts() {
    const tabs = getCourseTabButtons();
    for (const tab of tabs) {
        const courseId = tab.dataset.courseId;
        const course = COURSES.find((item) => item.id === courseId);
        const countEl = tab.querySelector('.tab-count');
        if (!course || !countEl) continue;

        const { status } = getCourseLoadState(courseId);
        if (status === 'ready') {
            countEl.textContent = String(course.data.length);
            continue;
        }

        countEl.textContent = status === 'error' ? '!' : '…';
    }
}

function switchCourseByOffset(offset, { focusTarget = 'none' } = {}) {
    const tabs = getCourseTabButtons();
    if (tabs.length === 0) return;

    const activeId = getActiveCourse().id;
    const activeIndex = tabs.findIndex((tab) => tab.dataset.courseId === activeId);
    const baseIndex = activeIndex >= 0 ? activeIndex : 0;
    const nextIndex = (baseIndex + offset + tabs.length) % tabs.length;
    const targetTab = tabs[nextIndex];
    const targetCourseId = targetTab?.dataset.courseId;

    if (!targetCourseId || targetCourseId === activeId) return;
    targetTab.click();

    requestAnimationFrame(() => {
        const nextTab = document.querySelector(
            `#course-tabs .course-tab[data-course-id="${targetCourseId}"]`
        );
        scrollTabIntoView(nextTab, { behavior: 'smooth' });

        if (focusTarget === 'search') {
            document.getElementById('search-input')?.focus();
            return;
        }

        if (focusTarget === 'course-search') {
            focusCourseSearchInput();
            return;
        }

        if (focusTarget === 'tab') {
            nextTab?.focus();
        }
    });
}

function getVisibleSidebarItems() {
    const container = document.getElementById('discipline-list');
    if (!container) return [];
    return Array.from(
        container.querySelectorAll('.discipline-header, .turma-item')
    ).filter((el) => el.offsetParent !== null);
}

function clearActiveSidebarClass() {
    const container = document.getElementById('discipline-list');
    if (!container) return;
    const current = container.querySelector('.kbd-active');
    if (current) current.classList.remove('kbd-active');
}

function setActiveSidebarItem(item) {
    clearActiveSidebarClass();

    if (!item) {
        activeSidebarKey = null;
        if (onTurmaHover) onTurmaHover(null, null);
        return;
    }

    item.classList.add('kbd-active');
    item.scrollIntoView({ block: 'nearest' });
    activeSidebarKey = item.dataset.navKey || null;

    const meta = activeSidebarKey ? sidebarNavMeta.get(activeSidebarKey) : null;
    if (!onTurmaHover) return;
    if (meta?.type === 'turma') {
        onTurmaHover(meta.disc, meta.turma);
    } else {
        onTurmaHover(null, null);
    }
}

function moveSidebarSelection(delta) {
    const items = getVisibleSidebarItems();
    if (items.length === 0) {
        setActiveSidebarItem(null);
        return;
    }

    let currentIndex = items.findIndex((el) => el.dataset.navKey === activeSidebarKey);
    if (currentIndex === -1) {
        currentIndex = delta > 0 ? -1 : items.length;
    }

    const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + delta));
    setActiveSidebarItem(items[nextIndex]);
}

function moveToDisciplineHeader(item) {
    const card = item.closest('.discipline-card');
    if (!card) return;
    const header = card.querySelector('.discipline-header');
    if (header) setActiveSidebarItem(header);
}

function moveToFirstTurma(item) {
    const card = item.closest('.discipline-card');
    if (!card) return;
    const firstTurma = Array.from(card.querySelectorAll('.turma-item')).find(
        (el) => el.offsetParent !== null
    );
    if (firstTurma) setActiveSidebarItem(firstTurma);
}

function activateCurrentSidebarItem() {
    const items = getVisibleSidebarItems();
    if (items.length === 0) return;

    const current = items.find((el) => el.dataset.navKey === activeSidebarKey) || items[0];
    current.click();
}

function handleSearchKeyboardNavigation(event) {
    const wantsCourseNav = event.ctrlKey || event.metaKey || event.altKey;
    if (wantsCourseNav && event.key === 'ArrowRight') {
        event.preventDefault();
        switchCourseByOffset(1, { focusTarget: 'search' });
        return;
    }

    if (wantsCourseNav && event.key === 'ArrowLeft') {
        event.preventDefault();
        switchCourseByOffset(-1, { focusTarget: 'search' });
        return;
    }

    const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'];
    if (!navKeys.includes(event.key)) return;

    const items = getVisibleSidebarItems();

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        const hasActiveItem = items.some((el) => el.dataset.navKey === activeSidebarKey);
        if (hasActiveItem) {
            const currentIndex = items.findIndex((el) => el.dataset.navKey === activeSidebarKey);
            if (currentIndex === items.length - 1) {
                setActiveSidebarItem(items[0]);
                return;
            }
            moveSidebarSelection(1);
            return;
        }
        const firstItem = items[0];
        if (firstItem) {
            setActiveSidebarItem(firstItem);
            return;
        }
        setActiveSidebarItem(null);
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (items.length === 0) {
            focusActiveCourseTab();
            return;
        }

        const currentIndex = items.findIndex((el) => el.dataset.navKey === activeSidebarKey);
        if (currentIndex === -1) {
            focusActiveCourseTab();
            return;
        }
        if (currentIndex === 0) {
            setActiveSidebarItem(null);
            document.getElementById('search-input')?.focus();
            return;
        }
        moveSidebarSelection(-1);
        return;
    }

    if (items.length === 0) return;

    const current = items.find((el) => el.dataset.navKey === activeSidebarKey) || items[0];

    if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (current.classList.contains('discipline-header')) {
            const card = current.closest('.discipline-card');
            if (card && !card.classList.contains('expanded')) {
                current.click();
            }
            moveToFirstTurma(current);
        }
        return;
    }

    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (current.classList.contains('turma-item')) {
            moveToDisciplineHeader(current);
            return;
        }

        if (current.classList.contains('discipline-header')) {
            const card = current.closest('.discipline-card');
            if (card && card.classList.contains('expanded')) {
                current.click();
                setActiveSidebarItem(current);
            }
        }
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        activateCurrentSidebarItem();
    }
}

function handleCourseSearchKeyboardNavigation(event) {
    const wantsCourseNav = event.ctrlKey || event.metaKey || event.altKey;
    if (wantsCourseNav && event.key === 'ArrowRight') {
        shouldRestoreCourseSearchFocusFromTab = false;
        event.preventDefault();
        switchCourseByOffset(1, { focusTarget: 'course-search' });
        return;
    }

    if (wantsCourseNav && event.key === 'ArrowLeft') {
        shouldRestoreCourseSearchFocusFromTab = false;
        event.preventDefault();
        switchCourseByOffset(-1, { focusTarget: 'course-search' });
        return;
    }

    if (event.key === 'ArrowUp') {
        shouldRestoreCourseSearchFocusFromTab = false;
        return;
    }

    if (event.key === 'ArrowDown') {
        shouldRestoreCourseSearchFocusFromTab = true;
        event.preventDefault();
        getCourseTabButtons()[0]?.focus();
        return;
    }

    if (event.key === 'Escape') {
        shouldRestoreCourseSearchFocusFromTab = false;
        event.preventDefault();
        setCourseFilterQuery('');
        renderCourseTabs();
        document.getElementById('search-input')?.focus();
        return;
    }

    if (event.key !== 'Enter') return;
    shouldRestoreCourseSearchFocusFromTab = false;
    event.preventDefault();
    const firstResult = getCourseTabButtons()[0];
    if (!firstResult) return;
    firstResult.click();
    requestAnimationFrame(() => {
        focusDisciplineSearchInput(true);
    });
}

function handleGlobalSidebarShortcuts(event) {
    const key = event.key.toLowerCase();
    const wantsCourseSearch = (event.ctrlKey || event.metaKey) && key === 'k';
    if (!wantsCourseSearch) return;

    shouldRestoreCourseSearchFocusFromTab = false;
    event.preventDefault();
    focusCourseSearchInput(true);
}

/**
 * Initialize the sidebar.
 */
export function initSidebar({ onToggle, getSelected, onTabChange, onHover }) {
    onTurmaToggle = onToggle;
    getSelectedTurmas = getSelected;
    onCourseChange = onTabChange;
    onTurmaHover = onHover;

    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    const courseSearchInput = document.getElementById('course-search-input');
    const clearCourseSearchBtn = document.getElementById('btn-clear-course-search');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value;
        clearBtn.style.display = query ? 'block' : 'none';
        renderDisciplineList(query);
    });
    searchInput.addEventListener('keydown', handleSearchKeyboardNavigation);
    searchInput.addEventListener('blur', () => {
        setActiveSidebarItem(null);
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        renderDisciplineList('');
        searchInput.focus();
    });

    courseSearchInput.addEventListener('input', () => {
        setCourseFilterQuery(courseSearchInput.value);
        renderCourseTabs();
    });
    courseSearchInput.addEventListener('keydown', handleCourseSearchKeyboardNavigation);

    clearCourseSearchBtn.addEventListener('click', () => {
        setCourseFilterQuery('');
        renderCourseTabs();
        courseSearchInput.focus();
    });

    window.addEventListener('keydown', handleGlobalSidebarShortcuts);

    bindCourseTabsWheelScroll();
    bindQuickTipsToggle();
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
    const coursesToRender = getFilteredCourses();

    if (coursesToRender.length === 0) {
        container.innerHTML = '<div class="course-tabs-empty">Nenhum curso encontrado.</div>';
        return;
    }

    for (const course of coursesToRender) {
        const tab = document.createElement('button');
        tab.className = `course-tab${course.id === activeCourse.id ? ' active' : ''}`;
        tab.dataset.courseId = course.id;
        tab.title = course.label;
        const safeCourseLabel = escapeHtml(course.label);
        tab.innerHTML = `
      <span class="tab-label">${safeCourseLabel}</span>
      <span class="tab-count">…</span>
    `;

        tab.addEventListener('click', () => {
            const shouldRestoreFocus = shouldRestoreCourseSearchFocusFromTab;
            shouldRestoreCourseSearchFocusFromTab = false;

            if (course.id === getActiveCourse().id) {
                if (shouldRestoreFocus) {
                    requestAnimationFrame(() => {
                        focusCourseSearchInput(true);
                    });
                }
                return;
            }
            setActiveCourse(course.id);
            expandedDisciplines.clear();
            renderCourseTabs();

            // Clear search on tab switch
            const searchInput = document.getElementById('search-input');
            const clearBtn = document.getElementById('btn-clear-search');
            searchInput.value = '';
            clearBtn.style.display = 'none';

            renderDisciplineList('');
            if (onCourseChange) onCourseChange(course.id);

            if (shouldRestoreFocus) {
                requestAnimationFrame(() => {
                    focusCourseSearchInput(true);
                });
            }
        });

        tab.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                shouldRestoreCourseSearchFocusFromTab = false;
                event.preventDefault();
                tab.click();
                requestAnimationFrame(() => {
                    focusDisciplineSearchInput(true);
                });
                return;
            }

            if (event.key === 'ArrowRight') {
                shouldRestoreCourseSearchFocusFromTab = false;
                event.preventDefault();
                switchCourseByOffset(1, { focusTarget: 'tab' });
                return;
            }

            if (event.key === 'ArrowLeft') {
                shouldRestoreCourseSearchFocusFromTab = false;
                event.preventDefault();
                switchCourseByOffset(-1, { focusTarget: 'tab' });
                return;
            }

            if (event.key === 'ArrowDown') {
                shouldRestoreCourseSearchFocusFromTab = false;
                event.preventDefault();
                setActiveSidebarItem(null);
                document.getElementById('search-input')?.focus();
                return;
            }

            if (event.key === 'ArrowUp') {
                shouldRestoreCourseSearchFocusFromTab = false;
                event.preventDefault();
                focusCourseSearchInput();
            }
        });

        container.appendChild(tab);
    }

    syncCourseTabCounts();
    requestAnimationFrame(() => {
        ensureActiveCourseTabVisible({ behavior: 'auto' });
    });
}

/**
 * Render the discipline list in the sidebar.
 */
export function renderDisciplineList(query) {
    const container = document.getElementById('discipline-list');
    const activeCourse = getActiveCourse();
    const loadState = getCourseLoadState(activeCourse.id);
    syncCourseTabCounts();

    if (loadState.status === 'idle' || loadState.status === 'loading') {
        container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">⏳</div>
        <div class="no-results-text">Carregando disciplinas...</div>
      </div>
    `;
        activeSidebarKey = null;
        return;
    }

    if (loadState.status === 'error') {
        container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">⚠️</div>
        <div class="no-results-text">Falha ao carregar disciplinas do Supabase</div>
      </div>
    `;
        activeSidebarKey = null;
        return;
    }

    const results = searchDisciplines(query);
    const previousActiveKey = activeSidebarKey;
    sidebarNavMeta.clear();
    if (onTurmaHover) onTurmaHover(null, null);

    if (results.length === 0) {
        container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <div class="no-results-text">Nenhuma disciplina encontrada</div>
      </div>
    `;
        activeSidebarKey = null;
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
        if (expandedDisciplines.has(disc.codigo)) {
            card.classList.add('expanded');
        }

        // Check if any turma of this discipline is selected
        const turmas = Array.isArray(disc.turmas) ? disc.turmas : [];
        const hasSelected = turmas.some((t) =>
            selectedKeys.has(`${disc.codigo}-${t.turma}`)
        );
        if (hasSelected) card.classList.add('has-selected');

        // Header
        const header = document.createElement('div');
        header.className = 'discipline-header';
        header.dataset.navKey = `disc:${disc.codigo}`;
        sidebarNavMeta.set(header.dataset.navKey, { type: 'disc', disc });
        const safeDiscCode = escapeHtml(disc.codigo);
        const safeDiscName = escapeHtml(disc.nome);
        const safeDiscHours = escapeHtml(disc.aulasPresenciais);
        header.innerHTML = `
      <span class="disc-code">${safeDiscCode}</span>
      <span class="disc-name" title="${safeDiscName}">${safeDiscName}</span>
      <span class="disc-hours">${safeDiscHours}h</span>
      <span class="disc-expand-icon">▶</span>
    `;

        header.addEventListener('click', () => {
            card.classList.toggle('expanded');
            if (card.classList.contains('expanded')) {
                expandedDisciplines.add(disc.codigo);
            } else {
                expandedDisciplines.delete(disc.codigo);
            }
        });

        card.appendChild(header);

        // Turma list
        const turmaListEl = document.createElement('div');
        turmaListEl.className = 'turma-list';

        for (const turma of turmas) {
            const turmaKey = `${disc.codigo}-${turma.turma}`;
            const isSelected = selectedKeys.has(turmaKey);
            const hasConflict = !isSelected && checkTurmaConflict(turma, disc.codigo);

            const item = document.createElement('div');
            item.className = `turma-item${isSelected ? ' selected' : ''}${hasConflict ? ' conflict' : ''}`;
            item.dataset.key = turmaKey;
            item.dataset.navKey = `turma:${turmaKey}`;
            sidebarNavMeta.set(item.dataset.navKey, { type: 'turma', disc, turma });

            const scheduleStr = formatTurmaSchedule(turma);
            const profStr = Array.isArray(turma.professores)
                ? (turma.professores.join(', ') || 'Professor não definido')
                : 'Professor não definido';
            const safeTurmaCode = escapeHtml(turma.turma);
            const safeEnquadramento = escapeHtml(turma.enquadramento);
            const safeVagasTotal = escapeHtml(turma.vagasTotal);
            const safeSchedule = escapeHtml(scheduleStr || 'Horário não definido');
            const safeProfessores = escapeHtml(profStr);

            item.innerHTML = `
        <div class="turma-top">
          <span class="turma-code">Turma ${safeTurmaCode} · ${safeEnquadramento}</span>
          <span class="turma-vagas">${safeVagasTotal} vagas</span>
        </div>
        <div class="turma-schedule">${safeSchedule}</div>
        <div class="turma-professor">${safeProfessores}</div>
        <div class="turma-conflict-msg">⚠ Conflito com disciplina já selecionada</div>
      `;

            if (isSelected) {
                const color = getColorForDiscipline(disc.codigo);
                item.style.borderColor = color.border;
                item.style.background = color.bg;
            }

            item.addEventListener('click', () => {
                expandedDisciplines.add(disc.codigo);
                if (onTurmaToggle) {
                    onTurmaToggle(disc, turma);
                }
            });

            item.addEventListener('mouseenter', () => {
                if (onTurmaHover) onTurmaHover(disc, turma);
            });

            item.addEventListener('mouseleave', () => {
                if (onTurmaHover) onTurmaHover(null, null);
            });

            turmaListEl.appendChild(item);
        }

        card.appendChild(turmaListEl);
        container.appendChild(card);
    }

    if (!previousActiveKey) return;

    const itemToRestore = getVisibleSidebarItems().find(
        (el) => el.dataset.navKey === previousActiveKey
    );
    if (itemToRestore) {
        setActiveSidebarItem(itemToRestore);
    } else {
        activeSidebarKey = null;
    }
}

/**
 * Check if a turma conflicts with currently selected turmas.
 */
function checkTurmaConflict(turma, codigo) {
    const selectedTurmas = getSelectedTurmas();
    const horarios = Array.isArray(turma?.horarios) ? turma.horarios : [];
    for (const h of horarios) {
        const key = slotKey(h);
        for (const sel of selectedTurmas) {
            if (sel.codigo === codigo) continue;
            const selectedHorarios = Array.isArray(sel?.horarios) ? sel.horarios : [];
            for (const sh of selectedHorarios) {
                if (slotKey(sh) === key) return true;
            }
        }
    }
    return false;
}
