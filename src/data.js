/**
 * Data layer — loads disciplines and provides search/conflict utilities.
 */
import disciplinasComputacao from './disciplinas_computacao.json';
import disciplinasEletrica from './disciplinas_eletrica.json';

/** Course definitions */
export const COURSES = [
    { id: 'computacao', label: 'Eng. Computação', data: disciplinasComputacao },
    { id: 'eletrica', label: 'Eng. Elétrica', data: disciplinasEletrica },
];

/** Current active course */
let activeCourseId = 'computacao';

export function getActiveCourse() {
    return COURSES.find((c) => c.id === activeCourseId);
}

export function setActiveCourse(id) {
    activeCourseId = id;
}

export function getActiveDisciplines() {
    return getActiveCourse().data;
}

/** Day labels (Brazilian convention: 2=Seg, 3=Ter, ...) */
export const DAY_LABELS = {
    2: 'Seg',
    3: 'Ter',
    4: 'Qua',
    5: 'Qui',
    6: 'Sex',
    7: 'Sáb',
};

export const DAYS = [2, 3, 4, 5, 6, 7];

/** Shifts and their slot ranges */
export const SHIFTS = [
    { key: 'M', label: 'Manhã', slots: [1, 2, 3, 4, 5, 6] },
    { key: 'T', label: 'Tarde', slots: [1, 2, 3, 4, 5, 6] },
    { key: 'N', label: 'Noite', slots: [1, 2, 3, 4, 5] },
];

/** Time mapping for display */
export const TIME_MAP = {
    M1: '07:30',
    M2: '08:20',
    M3: '09:10',
    M4: '10:20',
    M5: '11:10',
    M6: '12:00',
    T1: '13:00',
    T2: '13:50',
    T3: '14:40',
    T4: '15:50',
    T5: '16:40',
    T6: '17:30',
    N1: '18:40',
    N2: '19:30',
    N3: '20:20',
    N4: '21:20',
    N5: '22:10',
};

/**
 * Normalize text by removing diacritics (accents) and lowering case.
 */
function normalize(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Search disciplines by query (matches code or name, accent/case-insensitive).
 * Searches within the currently active course.
 */
export function searchDisciplines(query) {
    const disciplines = getActiveDisciplines();
    if (!query || !query.trim()) return disciplines;
    const q = normalize(query.trim());
    return disciplines.filter(
        (d) =>
            normalize(d.codigo).includes(q) ||
            normalize(d.nome).includes(q) ||
            d.turmas.some((t) =>
                t.professores.some((p) => normalize(p).includes(q))
            )
    );
}

/**
 * Create a slot key for conflict checking: "dia-turno-aula"
 */
export function slotKey(horario) {
    return `${horario.dia}-${horario.turno}-${horario.aula}`;
}

/**
 * Format a horario for display: "5M1 (CQ-203)"
 */
export function formatHorario(h) {
    const base = `${h.dia}${h.turno}${h.aula}`;
    return h.sala ? `${base}(${h.sala})` : base;
}

/**
 * Format schedule string for a turma
 */
export function formatTurmaSchedule(turma) {
    return turma.horarios.map(formatHorario).join(' · ');
}

/**
 * Color palette for selected disciplines
 */
const COLORS = [
    { bg: 'rgba(124, 92, 252, 0.25)', border: '#7c5cfc', text: '#c4b5fd' },
    { bg: 'rgba(92, 156, 252, 0.25)', border: '#5c9cfc', text: '#93c5fd' },
    { bg: 'rgba(92, 252, 188, 0.25)', border: '#5cfcbc', text: '#6ee7b7' },
    { bg: 'rgba(252, 92, 124, 0.25)', border: '#fc5c7c', text: '#fda4af' },
    { bg: 'rgba(252, 188, 92, 0.25)', border: '#fcbc5c', text: '#fcd34d' },
    { bg: 'rgba(196, 92, 252, 0.25)', border: '#c45cfc', text: '#d8b4fe' },
    { bg: 'rgba(92, 252, 240, 0.25)', border: '#5cfcf0', text: '#67e8f9' },
    { bg: 'rgba(252, 140, 92, 0.25)', border: '#fc8c5c', text: '#fdba74' },
    { bg: 'rgba(140, 252, 92, 0.25)', border: '#8cfc5c', text: '#a3e635' },
    { bg: 'rgba(252, 92, 240, 0.25)', border: '#fc5cf0', text: '#f0abfc' },
    { bg: 'rgba(92, 124, 252, 0.25)', border: '#5c7cfc', text: '#a5b4fc' },
    { bg: 'rgba(252, 252, 92, 0.25)', border: '#fcfc5c', text: '#fde047' },
];

let colorIndex = 0;
const colorMap = new Map();

export function getColorForDiscipline(codigo) {
    if (!colorMap.has(codigo)) {
        colorMap.set(codigo, COLORS[colorIndex % COLORS.length]);
        colorIndex++;
    }
    return colorMap.get(codigo);
}

export function resetColor(codigo) {
    colorMap.delete(codigo);
}

export function resetAllColors() {
    colorMap.clear();
    colorIndex = 0;
}
