-- FlashForge Demo Accounts & Sample Data Seed Script (#92)
-- Safe and idempotent: can be run repeatedly in Supabase SQL Editor.

-- 1. Demo Auth Users
insert into auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  created_at,
  updated_at
) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'demo.teacher@flashforge.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Prof. Eleanor Vance"}', 'authenticated', 'authenticated', now(), now()),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'demo.student1@flashforge.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Marcus Chen"}', 'authenticated', 'authenticated', now(), now()),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'demo.student2@flashforge.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sofia Patel"}', 'authenticated', 'authenticated', now(), now()),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'demo.admin@flashforge.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Alex Rivera (Admin)"}', 'authenticated', 'authenticated', now(), now())
on conflict (id) do update set
  email = excluded.email,
  raw_user_meta_data = excluded.raw_user_meta_data;

-- 2. Demo User Profiles
insert into public.profiles (id, display_name, role, role_chosen_at) values
  ('a0000000-0000-4000-8000-000000000001', 'Prof. Eleanor Vance', 'teacher', now()),
  ('a0000000-0000-4000-8000-000000000002', 'Marcus Chen', 'student', now()),
  ('a0000000-0000-4000-8000-000000000003', 'Sofia Patel', 'student', now()),
  ('a0000000-0000-4000-8000-000000000004', 'Alex Rivera (Admin)', 'admin', now())
on conflict (id) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  role_chosen_at = coalesce(public.profiles.role_chosen_at, excluded.role_chosen_at);

-- 3. Demo Class
insert into public.classes (id, teacher_id, name, join_code, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'BIO 101 - Cell Biology & Genetics', 'CHEM88', now() - interval '3 days')
on conflict (id) do update set
  name = excluded.name,
  join_code = excluded.join_code;

-- 4. Class Enrollments
insert into public.class_members (class_id, student_id, joined_at) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', now() - interval '2 days')
on conflict (class_id, student_id) do nothing;

-- 5. Sample Sets Across All 4 Study Types
-- Set 1: Flashcards
insert into public.flashcard_sets (id, user_id, title, source_filename, study_type, created_at) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Cell Biology Essentials', 'Bio101_Lecture1_CellStructure.pdf', 'flashcard', now() - interval '2 days')
on conflict (id) do update set
  title = excluded.title,
  study_type = excluded.study_type;

-- Set 2: Multiple Choice Quiz
insert into public.flashcard_sets (id, user_id, title, source_filename, study_type, created_at) values
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Cellular Genetics & Heredity', 'Genetics_Chapter4_Notes.pdf', 'multiple_choice', now() - interval '2 days')
on conflict (id) do update set
  title = excluded.title,
  study_type = excluded.study_type;

-- Set 3: True / False
insert into public.flashcard_sets (id, user_id, title, source_filename, study_type, created_at) values
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Principles of Ecology & Energy Flow', 'Ecology_Unit2_Overview.txt', 'true_false', now() - interval '1 day')
on conflict (id) do update set
  title = excluded.title,
  study_type = excluded.study_type;

-- Set 4: Mixed Quiz
insert into public.flashcard_sets (id, user_id, title, source_filename, study_type, created_at) values
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'General Biology Comprehensive Review', 'Bio_Midterm_Review_Sheet.pdf', 'mixed', now() - interval '1 day')
on conflict (id) do update set
  title = excluded.title,
  study_type = excluded.study_type;

-- 6. Flashcards
delete from public.flashcards where set_id in (
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000003',
  'b0000000-0000-4000-8000-000000000004'
);

-- Cards for Set 1 (Flashcards)
insert into public.flashcards (id, set_id, question, answer, position, source_excerpt, source_location) values
  ('c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Mitochondria', 'Powerhouse of the cell; generates ATP through cellular respiration.', 0, 'Mitochondria are often referred to as the powerhouses of the cell because they generate most of the chemical energy needed for biochemical reactions.', 'Page 3'),
  ('c1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Ribosome', 'Macromolecular machine responsible for translating mRNA into polypeptide chains.', 1, 'Ribosomes perform protein synthesis by reading messenger RNA transcripts.', 'Page 5'),
  ('c1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Endoplasmic Reticulum', 'Interconnected network of sacs involved in protein synthesis (rough) and lipid metabolism (smooth).', 2, 'The endoplasmic reticulum functions in protein folding, quality control, and lipid synthesis.', 'Page 7'),
  ('c1000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'Golgi Apparatus', 'Organelle that modifies, sorts, and packages proteins for secretion or delivery to other organelles.', 3, 'Proteins synthesized in the rough ER migrate to the Golgi apparatus for glycosylation and sorting.', 'Page 8'),
  ('c1000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'Chloroplast', 'Plant cell organelle containing thylakoids where sunlight is converted into glucose via photosynthesis.', 4, 'Chloroplasts capture light energy to drive the synthesis of organic compounds from carbon dioxide and water.', 'Page 11'),
  ('c1000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'Cell Membrane', 'Selectively permeable phospholipid bilayer regulating transport into and out of the cell.', 5, 'The fluid mosaic model depicts the cell membrane as a bilayer of phospholipids embedded with transport proteins.', 'Page 14');

-- Cards for Set 2 (Multiple Choice)
insert into public.flashcards (id, set_id, question, answer, options, position, source_excerpt, source_location) values
  ('c2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'Which molecule carries primary genetic instructions for organismal development and functioning?', 'DNA', '["DNA", "RNA", "Hemoglobin", "Glycogen"]'::jsonb, 0, 'Deoxyribonucleic acid (DNA) is the polymer that carries genetic instructions used in growth and reproduction.', 'Page 2'),
  ('c2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'What process reduces the chromosome number by half to produce four genetically diverse gametes?', 'Meiosis', '["Mitosis", "Meiosis", "Binary fission", "Cytokinesis"]'::jsonb, 1, 'Meiosis involves two sequential cell divisions resulting in four haploid gametes.', 'Page 6'),
  ('c2000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'Which nitrogenous base pairs with Adenine in a standard double-stranded DNA helix?', 'Thymine', '["Thymine", "Cytosine", "Guanine", "Uracil"]'::jsonb, 2, 'In double-stranded DNA, Adenine consistently pairs with Thymine via two hydrogen bonds.', 'Page 9'),
  ('c2000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002', 'What term describes variant forms of a specific gene located at the same locus on homologous chromosomes?', 'Alleles', '["Alleles", "Plasmids", "Histones", "Codons"]'::jsonb, 3, 'Alleles are mutational variants of a gene that account for diversity in inherited characteristics.', 'Page 12'),
  ('c2000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', 'In a classical Mendelian monohybrid cross of heterozygotes (Aa × Aa), what is the expected phenotypic ratio?', '3:1', '["3:1", "1:2:1", "9:3:3:1", "1:1"]'::jsonb, 4, 'A cross between two heterozygotes yields a 3:1 dominant to recessive phenotypic ratio.', 'Page 15');

-- Cards for Set 3 (True / False)
insert into public.flashcards (id, set_id, question, answer, explanation, position, source_excerpt, source_location) values
  ('c3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'Energy flows unidirectionally through ecosystems, while chemical nutrients are cycled continuously.', 'true', 'Solar energy dissipates as metabolic heat, whereas carbon, nitrogen, and phosphorus are recycled through biogeochemical cycles.', 0, 'Energy enters ecosystems from the sun and is lost as heat, whereas matter is conserved and recycled.', 'Line 8'),
  ('c3000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'Primary producers occupy the highest trophic level in terrestrial food pyramids.', 'false', 'Primary producers (autotrophs) form the base (first trophic level) of food webs, supporting herbivores and predators.', 1, 'Autotrophs or primary producers occupy the base trophic level, capturing approximately 1% of solar energy.', 'Line 24'),
  ('c3000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'Mutualism is an interspecific interaction in which both cooperating species experience enhanced biological fitness.', 'true', 'Both partners gain mutual ecological advantages, such as mycorrhizal fungi exchanging soil minerals for plant carbohydrates.', 2, 'Mutualism describes reciprocal symbiotic partnerships that benefit both participating organisms.', 'Line 42'),
  ('c3000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 'Carrying capacity represents the unlimited potential of a population to expand in the absence of environmental resistance.', 'false', 'Carrying capacity is the maximum population size an ecosystem can sustainably support, constrained by limiting resources.', 3, 'Carrying capacity (K) is the finite plateau where birth rates balance death rates due to environmental constraints.', 'Line 65');

-- Cards for Set 4 (Mixed Quiz)
insert into public.flashcards (id, set_id, question, answer, options, explanation, position, source_excerpt, source_location) values
  ('c4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'What metabolic pathway converts glucose into pyruvate, yielding a net gain of 2 ATP molecules?', 'Glycolysis', '["Glycolysis", "Krebs Cycle", "Oxidative phosphorylation", "Fermentation"]'::jsonb, null, 0, 'Glycolysis breaks down glucose in the cytoplasm without requiring oxygen.', 'Page 4'),
  ('c4000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004', 'Enzymes accelerate chemical reactions by lowering the required activation energy.', 'true', null, 'Biological catalysts stabilize transition states, substantially reducing the kinetic barrier to reaction completion.', 1, 'Enzymes speed metabolic transformations by lowering activation energy.', 'Page 9'),
  ('c4000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'Active Transport', 'Movement of ions or molecules across a cellular membrane against their concentration gradient, consuming ATP.', null, null, 2, 'Active transport requires ATP hydrolysis to move solutes uphill against electrochemical gradients.', 'Page 13');

-- 7. Assignment
insert into public.assignments (id, class_id, set_id, due_at, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', now() + interval '7 days', now() - interval '2 days')
on conflict (id) do update set
  due_at = excluded.due_at;

-- 8. Attempts (Student Scores)
insert into public.attempts (id, user_id, set_id, assignment_id, study_type, score, total, answers, completed_at) values
  -- Marcus Chen: 5/5 (100%)
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'multiple_choice', 5, 5, '[{"cardId":"c2000000-0000-4000-8000-000000000001","chosen":"DNA","correct":true},{"cardId":"c2000000-0000-4000-8000-000000000002","chosen":"Meiosis","correct":true},{"cardId":"c2000000-0000-4000-8000-000000000003","chosen":"Thymine","correct":true},{"cardId":"c2000000-0000-4000-8000-000000000004","chosen":"Alleles","correct":true},{"cardId":"c2000000-0000-4000-8000-000000000005","chosen":"3:1","correct":true}]'::jsonb, now() - interval '1 day'),
  -- Sofia Patel: 3/5 (60%)
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'multiple_choice', 3, 5, '[{"cardId":"c2000000-0000-4000-8000-000000000001","chosen":"DNA","correct":true},{"cardId":"c2000000-0000-4000-8000-000000000002","chosen":"Mitosis","correct":false},{"cardId":"c2000000-0000-4000-8000-000000000003","chosen":"Thymine","correct":true},{"cardId":"c2000000-0000-4000-8000-000000000004","chosen":"Alleles","correct":true},{"cardId":"c2000000-0000-4000-8000-000000000005","chosen":"1:2:1","correct":false}]'::jsonb, now() - interval '18 hours')
on conflict (id) do update set
  score = excluded.score,
  total = excluded.total,
  answers = excluded.answers;

-- 9. Sample Guide History Entry
insert into public.guide_history (id, user_id, title, study_type, source_filename, items, set_id, created_at) values
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Cell Biology Essentials', 'flashcard', 'Bio101_Lecture1_CellStructure.pdf', '[{"question":"Mitochondria","answer":"Powerhouse of the cell"},{"question":"Ribosome","answer":"Translates mRNA into protein"}]'::jsonb, 'b0000000-0000-4000-8000-000000000001', now() - interval '2 days')
on conflict (id) do nothing;
