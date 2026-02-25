/**
 * Data layer — loads disciplines from Supabase and provides search/conflict utilities.
 */
import coursesConfig from '../data/courses.json';

const SUPABASE_URL = (
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    ''
).trim();

const SUPABASE_ANON_KEY = (
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
).trim();

const COURSE_LOAD_IDLE = 'idle';
const COURSE_LOAD_LOADING = 'loading';
const COURSE_LOAD_READY = 'ready';
const COURSE_LOAD_ERROR = 'error';

/** Course definitions */
export const COURSES = (Array.isArray(coursesConfig) ? coursesConfig : [])
    .filter((course) =>
        course &&
        typeof course.id === 'string' &&
        course.id &&
        typeof course.label === 'string' &&
        course.label
    )
    .map((course) => ({
        id: course.id,
        label: course.label,
        data: [],
        loadState: COURSE_LOAD_IDLE,
        loadError: '',
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));

const courseLoadPromises = new Map(); // courseId -> Promise<Array>

function getCourseRecord(courseId) {
    return COURSES.find((course) => course.id === courseId) || null;
}

function getRestUrl(pathname, params = {}) {
    const base = SUPABASE_URL.replace(/\/+$/, '');
    const search = new URLSearchParams(params);
    return `${base}/rest/v1/${pathname}?${search.toString()}`;
}

function safeErrorMessage(error) {
    if (!error) return 'Erro desconhecido ao carregar disciplinas.';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return 'Erro desconhecido ao carregar disciplinas.';
}

function parseCoursePayload(payload) {
    if (!Array.isArray(payload) || payload.length === 0) return [];
    const disciplines = payload[0]?.disciplines;
    return Array.isArray(disciplines) ? disciplines : [];
}

function assertSupabaseConfig() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error(
            'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.'
        );
    }
}

/** Current active course */
const EMPTY_COURSE = { id: '', label: '', data: [] };
let activeCourseId = COURSES[0]?.id || '';

export function getActiveCourse() {
    return COURSES.find((c) => c.id === activeCourseId) || COURSES[0] || EMPTY_COURSE;
}

export function setActiveCourse(id) {
    if (!COURSES.some((course) => course.id === id)) return;
    activeCourseId = id;
}

export function getActiveDisciplines() {
    return getActiveCourse().data || [];
}

export function getCourseLoadState(courseId = activeCourseId) {
    const course = getCourseRecord(courseId);
    if (!course) {
        return {
            status: COURSE_LOAD_ERROR,
            error: 'Curso inválido.',
        };
    }
    return {
        status: course.loadState,
        error: course.loadError,
    };
}

export async function loadCourseDisciplines(courseId = activeCourseId) {
    const course = getCourseRecord(courseId);
    if (!course) return [];

    if (course.loadState === COURSE_LOAD_READY) return course.data;
    if (courseLoadPromises.has(courseId)) return courseLoadPromises.get(courseId);

    const loadPromise = (async () => {
        course.loadState = COURSE_LOAD_LOADING;
        course.loadError = '';

        assertSupabaseConfig();

        const response = await fetch(
            getRestUrl('course_disciplines', {
                select: 'disciplines',
                course_id: `eq.${courseId}`,
                limit: '1',
            }),
            {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    Accept: 'application/json',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Falha ao buscar ${courseId} no Supabase (HTTP ${response.status}).`);
        }

        const data = await response.json();
        course.data = parseCoursePayload(data);
        course.loadState = COURSE_LOAD_READY;
        return course.data;
    })()
        .catch((error) => {
            course.data = [];
            course.loadState = COURSE_LOAD_ERROR;
            course.loadError = safeErrorMessage(error);
            return [];
        })
        .finally(() => {
            courseLoadPromises.delete(courseId);
        });

    courseLoadPromises.set(courseId, loadPromise);
    return loadPromise;
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
    return String(str ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
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
            normalize(d?.codigo).includes(q) ||
            normalize(d?.nome).includes(q) ||
            (Array.isArray(d?.turmas) &&
                d.turmas.some(
                    (t) =>
                        Array.isArray(t?.professores) &&
                        t.professores.some((p) => normalize(p).includes(q))
                ))
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
    const base = `${h?.dia ?? ''}${h?.turno ?? ''}${h?.aula ?? ''}`;
    return h?.sala ? `${base}(${h.sala})` : base;
}

/**
 * Format schedule string for a turma
 */
export function formatTurmaSchedule(turma) {
    const horarios = Array.isArray(turma?.horarios) ? turma.horarios : [];
    return horarios.map(formatHorario).join(' · ');
}

/**
 * Color palettes for selected disciplines (dark & light themes)
 */
const COLORS_DARK = [
    { bg: 'rgba(109, 92, 252, 0.20)', border: '#7c6cfc', text: '#c4b5fd' },
    { bg: 'rgba(90, 143, 240, 0.20)', border: '#6a9ef0', text: '#93c5fd' },
    { bg: 'rgba(76, 216, 157, 0.20)', border: '#4cd89d', text: '#6ee7b7' },
    { bg: 'rgba(34, 180, 168, 0.20)', border: '#22b4a8', text: '#5eead4' },
    { bg: 'rgba(240, 168, 64, 0.20)', border: '#f0a840', text: '#fcd34d' },
    { bg: 'rgba(180, 92, 252, 0.20)', border: '#b46cfc', text: '#d8b4fe' },
    { bg: 'rgba(76, 216, 232, 0.20)', border: '#4cd8e8', text: '#67e8f9' },
    { bg: 'rgba(240, 128, 80, 0.20)', border: '#f08050', text: '#fdba74' },
    { bg: 'rgba(132, 204, 76, 0.20)', border: '#84cc4c', text: '#a3e635' },
    { bg: 'rgba(232, 92, 228, 0.20)', border: '#e85ce4', text: '#f0abfc' },
    { bg: 'rgba(92, 112, 240, 0.20)', border: '#5c70f0', text: '#a5b4fc' },
    { bg: 'rgba(232, 216, 76, 0.20)', border: '#e8d84c', text: '#fde047' },
];

const COLORS_LIGHT = [
    { bg: 'rgba(91, 75, 212, 0.24)', border: '#5b4bd4', text: '#4338ca' },
    { bg: 'rgba(74, 125, 212, 0.24)', border: '#4a7dd4', text: '#1d4ed8' },
    { bg: 'rgba(25, 135, 84, 0.24)', border: '#198754', text: '#166534' },
    { bg: 'rgba(13, 148, 136, 0.22)', border: '#0d9488', text: '#0f766e' },
    { bg: 'rgba(230, 126, 34, 0.22)', border: '#e67e22', text: '#c2410c' },
    { bg: 'rgba(147, 51, 234, 0.24)', border: '#9333ea', text: '#7e22ce' },
    { bg: 'rgba(6, 182, 212, 0.24)', border: '#06b6d4', text: '#0e7490' },
    { bg: 'rgba(234, 88, 12, 0.22)', border: '#ea580c', text: '#c2410c' },
    { bg: 'rgba(101, 163, 13, 0.24)', border: '#65a30d', text: '#4d7c0f' },
    { bg: 'rgba(217, 70, 239, 0.24)', border: '#d946ef', text: '#a21caf' },
    { bg: 'rgba(79, 70, 229, 0.24)', border: '#4f46e5', text: '#4338ca' },
    { bg: 'rgba(202, 138, 4, 0.24)', border: '#ca8a04', text: '#a16207' },
];

function getCurrentPalette() {
    return document.documentElement.dataset.theme === 'light' ? COLORS_LIGHT : COLORS_DARK;
}

let colorIndex = 0;
const colorAssignments = new Map(); // codigo -> palette index

export function getColorForDiscipline(codigo) {
    if (!colorAssignments.has(codigo)) {
        colorAssignments.set(codigo, colorIndex % 12);
        colorIndex++;
    }
    return getCurrentPalette()[colorAssignments.get(codigo)];
}

export function resetColor(codigo) {
    colorAssignments.delete(codigo);
}

export function resetAllColors() {
    colorAssignments.clear();
    colorIndex = 0;
}
