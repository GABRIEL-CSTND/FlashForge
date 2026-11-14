// Sample datasets and demo configurations for presentations and offline testing (#92).
// Covers all 4 study formats, class assignments, and student score attempts.

import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@/lib/classes-shared';
import type { StudyType } from '@/lib/study-types';

export interface DemoUser {
  id: string;
  email: string;
  displayName: string;
  role: 'student' | 'teacher' | 'admin';
}

export interface DemoCard {
  id: string;
  question: string;
  answer: string;
  options?: string[];
  explanation?: string;
  sourceExcerpt?: string;
  sourceLocation?: string;
  position: number;
}

export interface DemoSet {
  id: string;
  ownerId: string;
  title: string;
  studyType: StudyType;
  sourceFilename: string;
  cards: DemoCard[];
}

export interface DemoClass {
  id: string;
  teacherId: string;
  name: string;
  joinCode: string;
}

export interface DemoAttemptAnswer {
  cardId: string;
  chosen?: string;
  typed?: string;
  result?: 'got' | 'missed';
  correct: boolean;
}

export interface DemoAttempt {
  id: string;
  userId: string;
  setId: string;
  assignmentId?: string;
  studyType: StudyType;
  score: number;
  total: number;
  answers: DemoAttemptAnswer[];
  completedAt: string;
}

// Deterministic UUIDs for demo records to guarantee idempotence.
export const DEMO_IDS = {
  users: {
    teacher: 'a0000000-0000-4000-8000-000000000001',
    student1: 'a0000000-0000-4000-8000-000000000002',
    student2: 'a0000000-0000-4000-8000-000000000003',
    admin: 'a0000000-0000-4000-8000-000000000004',
  },
  class: 'c0000000-0000-4000-8000-000000000001',
  sets: {
    flashcards: 'b0000000-0000-4000-8000-000000000001',
    quiz: 'b0000000-0000-4000-8000-000000000002',
    trueFalse: 'b0000000-0000-4000-8000-000000000003',
    mixed: 'b0000000-0000-4000-8000-000000000004',
  },
  assignment: 'd0000000-0000-4000-8000-000000000001',
  attempts: {
    student1: 'e0000000-0000-4000-8000-000000000001',
    student2: 'e0000000-0000-4000-8000-000000000002',
  },
} as const;

export const DEMO_USERS: DemoUser[] = [
  {
    id: DEMO_IDS.users.teacher,
    email: 'demo.teacher@flashforge.test',
    displayName: 'Prof. Eleanor Vance',
    role: 'teacher',
  },
  {
    id: DEMO_IDS.users.student1,
    email: 'demo.student1@flashforge.test',
    displayName: 'Marcus Chen',
    role: 'student',
  },
  {
    id: DEMO_IDS.users.student2,
    email: 'demo.student2@flashforge.test',
    displayName: 'Sofia Patel',
    role: 'student',
  },
  {
    id: DEMO_IDS.users.admin,
    email: 'demo.admin@flashforge.test',
    displayName: 'Alex Rivera (Admin)',
    role: 'admin',
  },
];

// Clean 6-character code from JOIN_CODE_ALPHABET without look-alikes (0/O, 1/I/L).
export const DEMO_CLASS: DemoClass = {
  id: DEMO_IDS.class,
  teacherId: DEMO_IDS.users.teacher,
  name: 'BIO 101 - Cell Biology & Genetics',
  joinCode: 'CHEM88', // Formatted as CHE-M88
};

// 1. Flashcard Set: Cell Biology Essentials
export const DEMO_SET_FLASHCARDS: DemoSet = {
  id: DEMO_IDS.sets.flashcards,
  ownerId: DEMO_IDS.users.teacher,
  title: 'Cell Biology Essentials',
  studyType: 'flashcard',
  sourceFilename: 'Bio101_Lecture1_CellStructure.pdf',
  cards: [
    {
      id: 'c1000000-0000-4000-8000-000000000001',
      question: 'Mitochondria',
      answer: 'Powerhouse of the cell; generates ATP through cellular respiration.',
      sourceExcerpt: 'Mitochondria are often referred to as the powerhouses of the cell because they generate most of the chemical energy needed for biochemical reactions.',
      sourceLocation: 'Page 3',
      position: 0,
    },
    {
      id: 'c1000000-0000-4000-8000-000000000002',
      question: 'Ribosome',
      answer: 'Macromolecular machine responsible for translating mRNA into polypeptide chains.',
      sourceExcerpt: 'Ribosomes perform protein synthesis by reading messenger RNA transcripts.',
      sourceLocation: 'Page 5',
      position: 1,
    },
    {
      id: 'c1000000-0000-4000-8000-000000000003',
      question: 'Endoplasmic Reticulum',
      answer: 'Interconnected network of sacs involved in protein synthesis (rough) and lipid metabolism (smooth).',
      sourceExcerpt: 'The endoplasmic reticulum functions in protein folding, quality control, and lipid synthesis.',
      sourceLocation: 'Page 7',
      position: 2,
    },
    {
      id: 'c1000000-0000-4000-8000-000000000004',
      question: 'Golgi Apparatus',
      answer: 'Organelle that modifies, sorts, and packages proteins for secretion or delivery to other organelles.',
      sourceExcerpt: 'Proteins synthesized in the rough ER migrate to the Golgi apparatus for glycosylation and sorting.',
      sourceLocation: 'Page 8',
      position: 3,
    },
    {
      id: 'c1000000-0000-4000-8000-000000000005',
      question: 'Chloroplast',
      answer: 'Plant cell organelle containing thylakoids where sunlight is converted into glucose via photosynthesis.',
      sourceExcerpt: 'Chloroplasts capture light energy to drive the synthesis of organic compounds from carbon dioxide and water.',
      sourceLocation: 'Page 11',
      position: 4,
    },
    {
      id: 'c1000000-0000-4000-8000-000000000006',
      question: 'Cell Membrane',
      answer: 'Selectively permeable phospholipid bilayer regulating transport into and out of the cell.',
      sourceExcerpt: 'The fluid mosaic model depicts the cell membrane as a bilayer of phospholipids embedded with transport proteins.',
      sourceLocation: 'Page 14',
      position: 5,
    },
  ],
};

// 2. Multiple Choice Quiz Set: Cellular Genetics & Heredity
export const DEMO_SET_QUIZ: DemoSet = {
  id: DEMO_IDS.sets.quiz,
  ownerId: DEMO_IDS.users.teacher,
  title: 'Cellular Genetics & Heredity',
  studyType: 'multiple_choice',
  sourceFilename: 'Genetics_Chapter4_Notes.pdf',
  cards: [
    {
      id: 'c2000000-0000-4000-8000-000000000001',
      question: 'Which molecule carries primary genetic instructions for organismal development and functioning?',
      answer: 'DNA',
      options: ['DNA', 'RNA', 'Hemoglobin', 'Glycogen'],
      sourceExcerpt: 'Deoxyribonucleic acid (DNA) is the polymer that carries genetic instructions used in growth and reproduction.',
      sourceLocation: 'Page 2',
      position: 0,
    },
    {
      id: 'c2000000-0000-4000-8000-000000000002',
      question: 'What process reduces the chromosome number by half to produce four genetically diverse gametes?',
      answer: 'Meiosis',
      options: ['Mitosis', 'Meiosis', 'Binary fission', 'Cytokinesis'],
      sourceExcerpt: 'Meiosis involves two sequential cell divisions resulting in four haploid gametes.',
      sourceLocation: 'Page 6',
      position: 1,
    },
    {
      id: 'c2000000-0000-4000-8000-000000000003',
      question: 'Which nitrogenous base pairs with Adenine in a standard double-stranded DNA helix?',
      answer: 'Thymine',
      options: ['Thymine', 'Cytosine', 'Guanine', 'Uracil'],
      sourceExcerpt: 'In double-stranded DNA, Adenine consistently pairs with Thymine via two hydrogen bonds.',
      sourceLocation: 'Page 9',
      position: 2,
    },
    {
      id: 'c2000000-0000-4000-8000-000000000004',
      question: 'What term describes variant forms of a specific gene located at the same locus on homologous chromosomes?',
      answer: 'Alleles',
      options: ['Alleles', 'Plasmids', 'Histones', 'Codons'],
      sourceExcerpt: 'Alleles are mutational variants of a gene that account for diversity in inherited characteristics.',
      sourceLocation: 'Page 12',
      position: 3,
    },
    {
      id: 'c2000000-0000-4000-8000-000000000005',
      question: 'In a classical Mendelian monohybrid cross of heterozygotes (Aa × Aa), what is the expected phenotypic ratio?',
      answer: '3:1',
      options: ['3:1', '1:2:1', '9:3:3:1', '1:1'],
      sourceExcerpt: 'A cross between two heterozygotes yields a 3:1 dominant to recessive phenotypic ratio.',
      sourceLocation: 'Page 15',
      position: 4,
    },
  ],
};

// 3. True or False Set: Principles of Ecology & Energy Flow
export const DEMO_SET_TRUE_FALSE: DemoSet = {
  id: DEMO_IDS.sets.trueFalse,
  ownerId: DEMO_IDS.users.teacher,
  title: 'Principles of Ecology & Energy Flow',
  studyType: 'true_false',
  sourceFilename: 'Ecology_Unit2_Overview.txt',
  cards: [
    {
      id: 'c3000000-0000-4000-8000-000000000001',
      question: 'Energy flows unidirectionally through ecosystems, while chemical nutrients are cycled continuously.',
      answer: 'true',
      explanation: 'Solar energy dissipates as metabolic heat, whereas carbon, nitrogen, and phosphorus are recycled through biogeochemical cycles.',
      sourceExcerpt: 'Energy enters ecosystems from the sun and is lost as heat, whereas matter is conserved and recycled.',
      sourceLocation: 'Line 8',
      position: 0,
    },
    {
      id: 'c3000000-0000-4000-8000-000000000002',
      question: 'Primary producers occupy the highest trophic level in terrestrial food pyramids.',
      answer: 'false',
      explanation: 'Primary producers (autotrophs) form the base (first trophic level) of food webs, supporting herbivores and predators.',
      sourceExcerpt: 'Autotrophs or primary producers occupy the base trophic level, capturing approximately 1% of solar energy.',
      sourceLocation: 'Line 24',
      position: 1,
    },
    {
      id: 'c3000000-0000-4000-8000-000000000003',
      question: 'Mutualism is an interspecific interaction in which both cooperating species experience enhanced biological fitness.',
      answer: 'true',
      explanation: 'Both partners gain mutual ecological advantages, such as mycorrhizal fungi exchanging soil minerals for plant carbohydrates.',
      sourceExcerpt: 'Mutualism describes reciprocal symbiotic partnerships that benefit both participating organisms.',
      sourceLocation: 'Line 42',
      position: 2,
    },
    {
      id: 'c3000000-0000-4000-8000-000000000004',
      question: 'Carrying capacity represents the unlimited potential of a population to expand in the absence of environmental resistance.',
      answer: 'false',
      explanation: 'Carrying capacity is the maximum population size an ecosystem can sustainably support, constrained by limiting resources.',
      sourceExcerpt: 'Carrying capacity (K) is the finite plateau where birth rates balance death rates due to environmental constraints.',
      sourceLocation: 'Line 65',
      position: 3,
    },
  ],
};

// 4. Mixed Quiz Set: General Biology Comprehensive Review
export const DEMO_SET_MIXED: DemoSet = {
  id: DEMO_IDS.sets.mixed,
  ownerId: DEMO_IDS.users.teacher,
  title: 'General Biology Comprehensive Review',
  studyType: 'mixed',
  sourceFilename: 'Bio_Midterm_Review_Sheet.pdf',
  cards: [
    {
      id: 'c4000000-0000-4000-8000-000000000001',
      question: 'What metabolic pathway converts glucose into pyruvate, yielding a net gain of 2 ATP molecules?',
      answer: 'Glycolysis',
      options: ['Glycolysis', 'Krebs Cycle', 'Oxidative phosphorylation', 'Fermentation'],
      sourceExcerpt: 'Glycolysis breaks down glucose in the cytoplasm without requiring oxygen.',
      sourceLocation: 'Page 4',
      position: 0,
    },
    {
      id: 'c4000000-0000-4000-8000-000000000002',
      question: 'Enzymes accelerate chemical reactions by lowering the required activation energy.',
      answer: 'true',
      explanation: 'Biological catalysts stabilize transition states, substantially reducing the kinetic barrier to reaction completion.',
      sourceExcerpt: 'Enzymes speed metabolic transformations by lowering activation energy.',
      sourceLocation: 'Page 9',
      position: 1,
    },
    {
      id: 'c4000000-0000-4000-8000-000000000003',
      question: 'Active Transport',
      answer: 'Movement of ions or molecules across a cellular membrane against their concentration gradient, consuming ATP.',
      sourceExcerpt: 'Active transport requires ATP hydrolysis to move solutes uphill against electrochemical gradients.',
      sourceLocation: 'Page 13',
      position: 2,
    },
  ],
};

export const DEMO_SETS: DemoSet[] = [
  DEMO_SET_FLASHCARDS,
  DEMO_SET_QUIZ,
  DEMO_SET_TRUE_FALSE,
  DEMO_SET_MIXED,
];

// Student Attempts on the assigned Multiple Choice Set ("Cellular Genetics & Heredity")
export const DEMO_ATTEMPTS: DemoAttempt[] = [
  // Student 1 (Marcus Chen) - Perfect Score 5/5 (100%)
  {
    id: DEMO_IDS.attempts.student1,
    userId: DEMO_IDS.users.student1,
    setId: DEMO_IDS.sets.quiz,
    assignmentId: DEMO_IDS.assignment,
    studyType: 'multiple_choice',
    score: 5,
    total: 5,
    completedAt: '2026-11-13T10:15:00Z',
    answers: [
      { cardId: 'c2000000-0000-4000-8000-000000000001', chosen: 'DNA', correct: true },
      { cardId: 'c2000000-0000-4000-8000-000000000002', chosen: 'Meiosis', correct: true },
      { cardId: 'c2000000-0000-4000-8000-000000000003', chosen: 'Thymine', correct: true },
      { cardId: 'c2000000-0000-4000-8000-000000000004', chosen: 'Alleles', correct: true },
      { cardId: 'c2000000-0000-4000-8000-000000000005', chosen: '3:1', correct: true },
    ],
  },
  // Student 2 (Sofia Patel) - Score 3/5 (60%)
  // Misses Q2 (picks 'Mitosis') and Q5 (picks '1:2:1'), feeding into hardest-questions analytics (#59)
  {
    id: DEMO_IDS.attempts.student2,
    userId: DEMO_IDS.users.student2,
    setId: DEMO_IDS.sets.quiz,
    assignmentId: DEMO_IDS.assignment,
    studyType: 'multiple_choice',
    score: 3,
    total: 5,
    completedAt: '2026-11-13T11:45:00Z',
    answers: [
      { cardId: 'c2000000-0000-4000-8000-000000000001', chosen: 'DNA', correct: true },
      { cardId: 'c2000000-0000-4000-8000-000000000002', chosen: 'Mitosis', correct: false },
      { cardId: 'c2000000-0000-4000-8000-000000000003', chosen: 'Thymine', correct: true },
      { cardId: 'c2000000-0000-4000-8000-000000000004', chosen: 'Alleles', correct: true },
      { cardId: 'c2000000-0000-4000-8000-000000000005', chosen: '1:2:1', correct: false },
    ],
  },
];

// Helper to validate join code conformity with the database check constraint
export function isValidDemoJoinCode(code: string): boolean {
  if (code.length !== JOIN_CODE_LENGTH) return false;
  for (let i = 0; i < code.length; i++) {
    if (!JOIN_CODE_ALPHABET.includes(code[i])) return false;
  }
  return true;
}
