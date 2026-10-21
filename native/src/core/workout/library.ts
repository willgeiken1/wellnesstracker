import type { Equipment } from './rules';
export interface Exercise {
  name: string;
  main?: string;
  helpers: string[];
  equipment: Equipment;
}
/** Bundled PWA DEFAULT_WORKOUTS + exercise bank, names/muscles only (Q27).
 * The first listed basic muscle is main; remaining distinct muscles are helpers.
 * Equipment inference applies only to bundled names; custom names never infer metadata. */
const bundledExercises: Exercise[] = [{
  "name": "Pec Fly Machine",
  "main": "chest",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Smith Machine Incline Bench Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Chest Press Machine",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Cable Lateral Raise",
  "main": "sideDelts",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Shoulder Press Machine",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Rear Deltoid Fly Machine",
  "main": "rearDelts",
  "helpers": ["upperBack"],
  "equipment": "machine"
}, {
  "name": "Cable Tricep Pulldown",
  "main": "triceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Dips",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Pull Ups",
  "main": "lats",
  "helpers": ["upperBack", "biceps"],
  "equipment": "bodyweight"
}, {
  "name": "Lat Pulldown Machine",
  "main": "lats",
  "helpers": ["biceps"],
  "equipment": "machine"
}, {
  "name": "Seated Row Machine",
  "main": "upperBack",
  "helpers": ["lats", "rearDelts", "biceps"],
  "equipment": "machine"
}, {
  "name": "Plate Loaded Low Row",
  "main": "upperBack",
  "helpers": ["lats", "biceps"],
  "equipment": "machine"
}, {
  "name": "Cable Lat Pullover",
  "main": "lats",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Preacher Curl Machine",
  "main": "biceps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Bicep Curl Machine",
  "main": "biceps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Rope Hammer Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "cable"
}, {
  "name": "Seated Leg Press Machine",
  "main": "quads",
  "helpers": ["glutes"],
  "equipment": "machine"
}, {
  "name": "Barbell Romanian Deadlift (RDL)",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack"],
  "equipment": "barbell"
}, {
  "name": "Seated Leg Curl Machine",
  "main": "hamstrings",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Seated Leg Extension Machine",
  "main": "quads",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Abductor Machine",
  "main": "abductors",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Adductor Machine",
  "main": "adductors",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Calf Raises",
  "main": "calves",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Bench Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "barbell"
}, {
  "name": "Overhead Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps"],
  "equipment": "barbell"
}, {
  "name": "Cable Fly",
  "main": "chest",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Incline Dumbbell Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Row",
  "main": "upperBack",
  "helpers": ["lats", "biceps"],
  "equipment": "dumbbell"
}, {
  "name": "Squat",
  "main": "quads",
  "helpers": ["glutes", "lowerBack"],
  "equipment": "barbell"
}, {
  "name": "Deadlift",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack"],
  "equipment": "barbell"
}, {
  "name": "Push Ups",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Barbell Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "barbell"
}, {
  "name": "Barbell Preacher Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Bayesian Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Bodyweight Curl",
  "main": "biceps",
  "helpers": ["forearms", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Cable Crossover Bicep Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Cable Curl With Bar",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "cable"
}, {
  "name": "Cable Curl With Rope",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "cable"
}, {
  "name": "Cable Preacher Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Concentration Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Cross-Body Hammer Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "dumbbell"
}, {
  "name": "Drag Curl",
  "main": "biceps",
  "helpers": ["frontDelts"],
  "equipment": "barbell"
}, {
  "name": "Dumbbell Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Preacher Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "EZ Bar Preacher Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "EZ Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "other"
}, {
  "name": "Hammer Curl",
  "main": "forearms",
  "helpers": ["biceps"],
  "equipment": "dumbbell"
}, {
  "name": "Incline Dumbbell Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Incline Hammer Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "dumbbell"
}, {
  "name": "Kettlebell Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "other"
}, {
  "name": "Lying Bicep Cable Curl on Bench",
  "main": "biceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Lying Bicep Cable Curl on Floor",
  "main": "biceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Machine Bicep Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Machine Preacher Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Overhead Cable Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Resistance Band Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "other"
}, {
  "name": "Reverse Barbell Curl",
  "main": "forearms",
  "helpers": ["biceps"],
  "equipment": "barbell"
}, {
  "name": "Reverse Dumbbell Curl",
  "main": "forearms",
  "helpers": ["biceps"],
  "equipment": "dumbbell"
}, {
  "name": "Spider Curl",
  "main": "biceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Zottman Curl",
  "main": "biceps",
  "helpers": ["forearms"],
  "equipment": "dumbbell"
}, {
  "name": "Assisted Dip",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "other"
}, {
  "name": "Band-Assisted Bench Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "other"
}, {
  "name": "Bar Dip",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "other"
}, {
  "name": "Barbell Pullover",
  "main": "chest",
  "helpers": ["lats", "triceps", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Bench Press Against Band",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "other"
}, {
  "name": "Board Press",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "barbell"
}, {
  "name": "Cable Chest Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "cable"
}, {
  "name": "Clap Push-Up",
  "main": "chest",
  "helpers": ["triceps", "frontDelts", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Close-Grip Bench Press",
  "main": "triceps",
  "helpers": ["chest", "frontDelts"],
  "equipment": "other"
}, {
  "name": "Close-Grip Dumbbell Bench Press",
  "main": "triceps",
  "helpers": ["chest", "frontDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Close-Grip Feet-Up Bench Press",
  "main": "triceps",
  "helpers": ["chest", "frontDelts", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Cobra Push-Up",
  "main": "chest",
  "helpers": ["triceps", "abs", "obliques", "lowerBack"],
  "equipment": "bodyweight"
}, {
  "name": "Decline Bench Press",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "other"
}, {
  "name": "Decline Dumbbell Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Decline Push-Up",
  "main": "chest",
  "helpers": ["frontDelts", "triceps", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Dumbbell Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Chest Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Decline Chest Press",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Floor Press",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Pullover",
  "main": "chest",
  "helpers": ["lats", "triceps", "obliques"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Squeeze Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "dumbbell"
}, {
  "name": "Feet-Up Bench Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Floor Press",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "barbell"
}, {
  "name": "Incline Bench Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "other"
}, {
  "name": "Incline Cable Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "cable"
}, {
  "name": "Incline Dumbbell Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Incline Push-Up",
  "main": "chest",
  "helpers": ["triceps", "frontDelts", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Kettlebell Floor Press",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "other"
}, {
  "name": "Kneeling Incline Push-Up",
  "main": "chest",
  "helpers": ["triceps", "frontDelts", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Kneeling Push-Up",
  "main": "chest",
  "helpers": ["triceps", "frontDelts", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Low to High Cable Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "cable"
}, {
  "name": "Machine Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "machine"
}, {
  "name": "Machine Chest Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Machine Decline Chest Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Machine Incline Chest Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Medicine Ball Chest Pass",
  "main": "chest",
  "helpers": ["frontDelts", "triceps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Pause Bench Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "other"
}, {
  "name": "Pec Deck",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "other"
}, {
  "name": "Pin Bench Press",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "other"
}, {
  "name": "Plank to Push-Up",
  "main": "chest",
  "helpers": ["triceps", "frontDelts", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Push-Up",
  "main": "chest",
  "helpers": ["frontDelts", "triceps", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Push-Up Against Wall",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "bodyweight"
}, {
  "name": "Push-Ups With Feet in Rings",
  "main": "chest",
  "helpers": ["frontDelts", "triceps", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Resistance Band Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "other"
}, {
  "name": "Ring Dip",
  "main": "chest",
  "helpers": ["triceps", "frontDelts", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Seated Cable Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "cable"
}, {
  "name": "Smith Machine Bench Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Close-Grip Bench Press",
  "main": "triceps",
  "helpers": ["chest", "frontDelts"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Decline Bench Press",
  "main": "chest",
  "helpers": ["frontDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Reverse Grip Bench Press",
  "main": "chest",
  "helpers": ["triceps", "frontDelts"],
  "equipment": "machine"
}, {
  "name": "Standing Cable Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts", "abs", "obliques"],
  "equipment": "cable"
}, {
  "name": "Standing Resistance Band Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Air Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "adductors", "calves"],
  "equipment": "other"
}, {
  "name": "Banded Hip March",
  "main": "quads",
  "helpers": ["abductors", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Barbell Hack Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "barbell"
}, {
  "name": "Barbell Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Barbell Thruster",
  "main": "quads",
  "helpers": ["glutes", "frontDelts", "sideDelts", "triceps", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Barbell Walking Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Belt Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Body Weight Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "other"
}, {
  "name": "Bodyweight Leg Curl",
  "main": "hamstrings",
  "helpers": ["glutes", "calves"],
  "equipment": "other"
}, {
  "name": "Box Jump",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "bodyweight"
}, {
  "name": "Box Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "adductors"],
  "equipment": "other"
}, {
  "name": "Bulgarian Split Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Burpee",
  "main": "quads",
  "helpers": ["glutes", "chest", "frontDelts", "triceps", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Cable Machine Hip Adduction",
  "main": "adductors",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Chair Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Curtsy Lunge",
  "main": "quads",
  "helpers": ["abductors", "glutes", "adductors"],
  "equipment": "bodyweight"
}, {
  "name": "Depth Jump",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "bodyweight"
}, {
  "name": "Dumbbell Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Split Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "adductors"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Thruster",
  "main": "quads",
  "helpers": ["glutes", "frontDelts", "sideDelts", "triceps", "abs", "obliques"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Walking Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "dumbbell"
}, {
  "name": "Front Squat",
  "main": "quads",
  "helpers": ["glutes", "traps", "upperBack", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Glute Ham Raise",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack", "calves"],
  "equipment": "bodyweight"
}, {
  "name": "Goblet Squat",
  "main": "quads",
  "helpers": ["glutes", "abs", "obliques", "traps", "upperBack"],
  "equipment": "other"
}, {
  "name": "Ground to Overhead",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "frontDelts", "sideDelts", "rearDelts", "lowerBack", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Hack Squat Machine",
  "main": "quads",
  "helpers": ["glutes"],
  "equipment": "machine"
}, {
  "name": "Half Air Squat",
  "main": "quads",
  "helpers": ["glutes"],
  "equipment": "other"
}, {
  "name": "Heel Walk",
  "main": "calves",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Hip Adduction Against Band",
  "main": "adductors",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Hip Adduction Machine",
  "main": "adductors",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Horizontal Leg Press",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Jump Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "other"
}, {
  "name": "Jumping Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "bodyweight"
}, {
  "name": "Kettlebell Front Squat",
  "main": "quads",
  "helpers": ["glutes", "abs", "obliques", "traps", "upperBack"],
  "equipment": "other"
}, {
  "name": "Kettlebell Thrusters",
  "main": "quads",
  "helpers": ["glutes", "frontDelts", "triceps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Kettlebell Tibialis Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Landmine Hack Squat",
  "main": "quads",
  "helpers": ["glutes", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Lateral Bound",
  "main": "abductors",
  "helpers": ["quads", "adductors", "calves"],
  "equipment": "bodyweight"
}, {
  "name": "Leg Curl On Ball",
  "main": "hamstrings",
  "helpers": ["glutes", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Leg Extension",
  "main": "quads",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Leg Press",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Lying Leg Curl",
  "main": "hamstrings",
  "helpers": ["calves"],
  "equipment": "machine"
}, {
  "name": "Nordic Hamstring Eccentric",
  "main": "hamstrings",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "One-Legged Leg Extension",
  "main": "quads",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "One-Legged Leg Press",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "other"
}, {
  "name": "One-Legged Lying Leg Curl",
  "main": "hamstrings",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "One-Legged Seated Leg Curl",
  "main": "hamstrings",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Overhead Squat",
  "main": "quads",
  "helpers": ["glutes", "adductors", "frontDelts", "sideDelts", "traps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Pause Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Pendulum Squat",
  "main": "quads",
  "helpers": ["glutes"],
  "equipment": "other"
}, {
  "name": "Pin Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Pistol Squat",
  "main": "quads",
  "helpers": ["glutes", "calves", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Poliquin Step-Up",
  "main": "quads",
  "helpers": ["glutes", "calves"],
  "equipment": "bodyweight"
}, {
  "name": "Prisoner Get Up",
  "main": "quads",
  "helpers": ["glutes", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Resistance Band Romanian Deadlift",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack"],
  "equipment": "other"
}, {
  "name": "Reverse Barbell Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "barbell"
}, {
  "name": "Reverse Body Weight Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Reverse Dumbbell Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "dumbbell"
}, {
  "name": "Reverse Nordic",
  "main": "quads",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Romanian Deadlift",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack"],
  "equipment": "other"
}, {
  "name": "Safety Bar Squat",
  "main": "quads",
  "helpers": ["glutes", "traps", "upperBack", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Seated Leg Curl",
  "main": "hamstrings",
  "helpers": ["calves"],
  "equipment": "machine"
}, {
  "name": "Shallow Body Weight Lunge",
  "main": "quads",
  "helpers": ["glutes"],
  "equipment": "other"
}, {
  "name": "Side Lunges (Bodyweight)",
  "main": "quads",
  "helpers": ["glutes", "adductors", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Sissy Squat",
  "main": "quads",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Sled Drag",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Sled Push",
  "main": "quads",
  "helpers": ["glutes", "calves", "hamstrings", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Smith Machine Bulgarian Split Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Front Squat",
  "main": "quads",
  "helpers": ["glutes", "abs", "obliques"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Lunge",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Romanian Deadlift",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Split Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "adductors"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Squat",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "machine"
}, {
  "name": "Standing Cable Leg Extension",
  "main": "quads",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Standing Hip Flexor Raise",
  "main": "quads",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Standing Leg Curl",
  "main": "hamstrings",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Standing Leg Curl Against Band",
  "main": "hamstrings",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Step Up",
  "main": "quads",
  "helpers": ["glutes", "hamstrings", "calves"],
  "equipment": "bodyweight"
}, {
  "name": "Sumo Squat",
  "main": "quads",
  "helpers": ["adductors", "glutes"],
  "equipment": "other"
}, {
  "name": "Tibialis Band Pull",
  "main": "calves",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Tibialis Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Vertical Leg Press",
  "main": "quads",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Wall Sit",
  "main": "quads",
  "helpers": ["glutes"],
  "equipment": "bodyweight"
}, {
  "name": "Zercher Squat",
  "main": "quads",
  "helpers": ["glutes", "traps", "upperBack", "abs", "obliques", "biceps"],
  "equipment": "other"
}, {
  "name": "Arnold Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps", "chest"],
  "equipment": "dumbbell"
}, {
  "name": "Band External Shoulder Rotation",
  "main": "upperBack",
  "helpers": ["rearDelts"],
  "equipment": "other"
}, {
  "name": "Band Internal Shoulder Rotation",
  "main": "upperBack",
  "helpers": ["chest", "lats"],
  "equipment": "other"
}, {
  "name": "Band Pull-Apart",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "other"
}, {
  "name": "Banded Face Pull",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "other"
}, {
  "name": "Barbell Front Raise",
  "main": "frontDelts",
  "helpers": ["chest"],
  "equipment": "barbell"
}, {
  "name": "Barbell Rear Delt Row",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "barbell"
}, {
  "name": "Barbell Upright Row",
  "main": "sideDelts",
  "helpers": ["traps", "biceps"],
  "equipment": "barbell"
}, {
  "name": "Battle Ropes",
  "main": "frontDelts",
  "helpers": ["sideDelts", "forearms", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Behind the Neck Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "traps", "triceps"],
  "equipment": "barbell"
}, {
  "name": "Cable External Shoulder Rotation",
  "main": "upperBack",
  "helpers": ["rearDelts"],
  "equipment": "cable"
}, {
  "name": "Cable Front Raise",
  "main": "frontDelts",
  "helpers": ["chest"],
  "equipment": "cable"
}, {
  "name": "Cable Internal Shoulder Rotation",
  "main": "upperBack",
  "helpers": ["chest"],
  "equipment": "cable"
}, {
  "name": "Cable Rear Delt Row",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "cable"
}, {
  "name": "Cable Upright Row",
  "main": "sideDelts",
  "helpers": ["traps", "biceps"],
  "equipment": "cable"
}, {
  "name": "Cable Y-Raise",
  "main": "sideDelts",
  "helpers": ["rearDelts", "traps"],
  "equipment": "cable"
}, {
  "name": "Cuban Press",
  "main": "upperBack",
  "helpers": ["sideDelts", "rearDelts", "traps"],
  "equipment": "other"
}, {
  "name": "Devils Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "rearDelts", "chest", "triceps", "glutes", "abductors", "hamstrings", "abs", "obliques"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Front Raise",
  "main": "frontDelts",
  "helpers": ["chest"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Horizontal External Shoulder Rotation",
  "main": "upperBack",
  "helpers": ["rearDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Horizontal Internal Shoulder Rotation",
  "main": "upperBack",
  "helpers": ["chest"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Lateral Raise",
  "main": "sideDelts",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Push Press",
  "main": "frontDelts",
  "helpers": ["triceps", "quads", "glutes", "abductors"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Rear Delt Row",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Shoulder Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Upright Row",
  "main": "sideDelts",
  "helpers": ["traps", "biceps"],
  "equipment": "dumbbell"
}, {
  "name": "Face Pull",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "other"
}, {
  "name": "Front Hold",
  "main": "frontDelts",
  "helpers": ["abs", "obliques", "chest"],
  "equipment": "other"
}, {
  "name": "Handstand Push-Up",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps", "chest", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Jerk",
  "main": "frontDelts",
  "helpers": ["triceps", "quads", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Kettlebell Halo",
  "main": "frontDelts",
  "helpers": ["sideDelts", "rearDelts", "upperBack", "traps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Kettlebell Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Kettlebell Push Press",
  "main": "frontDelts",
  "helpers": ["triceps", "quads", "glutes", "abductors"],
  "equipment": "other"
}, {
  "name": "Landmine Press",
  "main": "frontDelts",
  "helpers": ["chest", "triceps", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Lying Dumbbell External Shoulder Rotation",
  "main": "upperBack",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Lying Dumbbell Internal Shoulder Rotation",
  "main": "upperBack",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Machine Lateral Raise",
  "main": "sideDelts",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Machine Shoulder Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Monkey Row",
  "main": "sideDelts",
  "helpers": ["traps", "biceps"],
  "equipment": "other"
}, {
  "name": "One-Arm Landmine Press",
  "main": "frontDelts",
  "helpers": ["chest", "triceps", "obliques", "abs"],
  "equipment": "barbell"
}, {
  "name": "Pike Push-Up",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps", "chest"],
  "equipment": "bodyweight"
}, {
  "name": "Plate Front Raise",
  "main": "frontDelts",
  "helpers": ["chest"],
  "equipment": "other"
}, {
  "name": "Poliquin Raise",
  "main": "sideDelts",
  "helpers": ["frontDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Power Jerk",
  "main": "frontDelts",
  "helpers": ["triceps", "quads", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Push Press",
  "main": "frontDelts",
  "helpers": ["triceps", "quads", "glutes", "abductors"],
  "equipment": "barbell"
}, {
  "name": "Resistance Band Lateral Raise",
  "main": "sideDelts",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Resistance Band Shoulder Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps"],
  "equipment": "other"
}, {
  "name": "Reverse Cable Flyes",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "cable"
}, {
  "name": "Reverse Dumbbell Flyes",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "dumbbell"
}, {
  "name": "Reverse Dumbbell Flyes on Incline Bench",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "dumbbell"
}, {
  "name": "Reverse Machine Fly",
  "main": "rearDelts",
  "helpers": ["upperBack", "traps"],
  "equipment": "machine"
}, {
  "name": "Seated Barbell Overhead Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps"],
  "equipment": "barbell"
}, {
  "name": "Seated Dumbbell Shoulder Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps"],
  "equipment": "dumbbell"
}, {
  "name": "Seated Kettlebell Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Seated Smith Machine Shoulder Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Landmine Press",
  "main": "frontDelts",
  "helpers": ["chest", "triceps"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Upright Row",
  "main": "sideDelts",
  "helpers": ["traps", "biceps"],
  "equipment": "machine"
}, {
  "name": "Snatch Grip Behind the Neck Press",
  "main": "frontDelts",
  "helpers": ["traps", "upperBack", "triceps"],
  "equipment": "barbell"
}, {
  "name": "Squat Jerk",
  "main": "frontDelts",
  "helpers": ["quads", "glutes", "abductors", "triceps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Split Jerk",
  "main": "frontDelts",
  "helpers": ["quads", "glutes", "abductors", "triceps", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Turkish Get-Up",
  "main": "frontDelts",
  "helpers": ["sideDelts", "rearDelts", "upperBack", "abs", "obliques", "glutes", "abductors", "quads"],
  "equipment": "other"
}, {
  "name": "Wall Walk",
  "main": "frontDelts",
  "helpers": ["sideDelts", "abs", "obliques", "triceps", "traps", "upperBack"],
  "equipment": "bodyweight"
}, {
  "name": "Z Press",
  "main": "frontDelts",
  "helpers": ["sideDelts", "triceps", "abs", "obliques", "quads"],
  "equipment": "barbell"
}, {
  "name": "Barbell Incline Triceps Extension",
  "main": "triceps",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Barbell Lying Triceps Extension",
  "main": "triceps",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Barbell Standing Triceps Extension",
  "main": "triceps",
  "helpers": ["abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Bench Dip",
  "main": "triceps",
  "helpers": ["frontDelts", "chest"],
  "equipment": "other"
}, {
  "name": "Cable Triceps Kickback",
  "main": "triceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Close-Grip Push-Up",
  "main": "triceps",
  "helpers": ["chest", "frontDelts", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Crossbody Cable Triceps Extension",
  "main": "triceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Dumbbell Lying Triceps Extension",
  "main": "triceps",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Standing Triceps Extension",
  "main": "triceps",
  "helpers": ["abs", "obliques"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Triceps Kickback",
  "main": "triceps",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "EZ Bar Lying Triceps Extension",
  "main": "triceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Machine Overhead Triceps Extension",
  "main": "triceps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Machine Triceps Extension",
  "main": "triceps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "One-Handed Tricep Pushdown",
  "main": "triceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Overhead Cable Triceps Extension (Lower Position)",
  "main": "triceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Overhead Cable Triceps Extension (Upper Position)",
  "main": "triceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "JM Press",
  "main": "triceps",
  "helpers": ["chest", "frontDelts"],
  "equipment": "barbell"
}, {
  "name": "Reverse-Grip Tricep Pushdown",
  "main": "triceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Seated Dip Machine",
  "main": "triceps",
  "helpers": ["chest", "frontDelts"],
  "equipment": "machine"
}, {
  "name": "Smith Machine JM Press",
  "main": "triceps",
  "helpers": ["chest", "frontDelts"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Skull Crushers",
  "main": "triceps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Tate Press",
  "main": "triceps",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Tricep Bodyweight Extension",
  "main": "triceps",
  "helpers": ["abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Tricep Pushdown With Bar",
  "main": "triceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Tricep Pushdown With Rope",
  "main": "triceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Tricep Pushdown With V-Bar",
  "main": "triceps",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Ball Slams",
  "main": "abs",
  "helpers": ["obliques", "lats", "frontDelts"],
  "equipment": "other"
}, {
  "name": "Bench Leg Pull-In",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Bicycle Crunch",
  "main": "abs",
  "helpers": ["obliques", "quads"],
  "equipment": "bodyweight"
}, {
  "name": "Cable Crunch",
  "main": "abs",
  "helpers": ["obliques"],
  "equipment": "cable"
}, {
  "name": "Captain's Chair Knee Raise",
  "main": "abs",
  "helpers": ["quads", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Captain's Chair Leg Raise",
  "main": "abs",
  "helpers": ["quads", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Copenhagen Plank",
  "main": "adductors",
  "helpers": ["obliques", "abs"],
  "equipment": "bodyweight"
}, {
  "name": "Core Twist",
  "main": "obliques",
  "helpers": ["abs"],
  "equipment": "other"
}, {
  "name": "Crunch",
  "main": "abs",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Dead Bug",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Dead Bug With Dumbbells",
  "main": "abs",
  "helpers": ["frontDelts", "sideDelts", "rearDelts", "quads"],
  "equipment": "dumbbell"
}, {
  "name": "Decline Sit-Up",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Dragon Flag",
  "main": "abs",
  "helpers": ["obliques", "lowerBack", "lats"],
  "equipment": "bodyweight"
}, {
  "name": "Dumbbell Side Bend",
  "main": "obliques",
  "helpers": ["lowerBack", "abs"],
  "equipment": "dumbbell"
}, {
  "name": "Dynamic Side Plank",
  "main": "obliques",
  "helpers": ["abductors", "abs", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Flutter Kicks",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Hanging Knee Raise",
  "main": "abs",
  "helpers": ["quads", "forearms"],
  "equipment": "bodyweight"
}, {
  "name": "Hanging Leg Raise",
  "main": "abs",
  "helpers": ["quads", "forearms"],
  "equipment": "bodyweight"
}, {
  "name": "Hanging Sit-Up",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Hanging Windshield Wiper",
  "main": "obliques",
  "helpers": ["abs", "quads", "forearms"],
  "equipment": "bodyweight"
}, {
  "name": "Heel Touches",
  "main": "obliques",
  "helpers": ["abs"],
  "equipment": "bodyweight"
}, {
  "name": "High to Low Wood Chop with Band",
  "main": "obliques",
  "helpers": ["abs", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "other"
}, {
  "name": "High to Low Wood Chop with Cable",
  "main": "obliques",
  "helpers": ["abs", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "cable"
}, {
  "name": "Hollow Body Crunch",
  "main": "abs",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Hollow Hold",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Horizontal Wood Chop with Band",
  "main": "obliques",
  "helpers": ["abs"],
  "equipment": "other"
}, {
  "name": "Horizontal Wood Chop with Cable",
  "main": "obliques",
  "helpers": ["abs"],
  "equipment": "cable"
}, {
  "name": "Jackknife Sit-Up",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Kettlebell Plank Pull Through",
  "main": "abs",
  "helpers": ["obliques", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Kneeling Ab Wheel Roll-Out",
  "main": "abs",
  "helpers": ["lats", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Kneeling Plank",
  "main": "abs",
  "helpers": ["obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Kneeling Side Plank",
  "main": "obliques",
  "helpers": ["abs", "abductors"],
  "equipment": "bodyweight"
}, {
  "name": "L-Sit",
  "main": "abs",
  "helpers": ["quads", "triceps", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Landmine Rotation",
  "main": "obliques",
  "helpers": ["abs", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "barbell"
}, {
  "name": "Low to High Wood Chop with Band",
  "main": "obliques",
  "helpers": ["abs", "frontDelts"],
  "equipment": "other"
}, {
  "name": "Low to High Wood Chop with Cable",
  "main": "obliques",
  "helpers": ["abs", "frontDelts"],
  "equipment": "cable"
}, {
  "name": "Lying Leg Raise",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Lying Windshield Wiper",
  "main": "obliques",
  "helpers": ["abs"],
  "equipment": "bodyweight"
}, {
  "name": "Lying Windshield Wiper with Bent Knees",
  "main": "obliques",
  "helpers": ["abs"],
  "equipment": "bodyweight"
}, {
  "name": "Machine Crunch",
  "main": "abs",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Mountain Climbers",
  "main": "abs",
  "helpers": ["quads", "frontDelts", "sideDelts", "rearDelts", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Oblique Crunch",
  "main": "obliques",
  "helpers": ["abs"],
  "equipment": "bodyweight"
}, {
  "name": "Oblique Sit-Up",
  "main": "obliques",
  "helpers": ["abs", "quads"],
  "equipment": "bodyweight"
}, {
  "name": "Pallof Press",
  "main": "abs",
  "helpers": ["obliques"],
  "equipment": "other"
}, {
  "name": "Plank",
  "main": "abs",
  "helpers": ["obliques", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Plank with Leg Lifts",
  "main": "abs",
  "helpers": ["glutes"],
  "equipment": "bodyweight"
}, {
  "name": "Plank with Shoulder Taps",
  "main": "abs",
  "helpers": ["obliques", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Reverse Crunch",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Side Plank",
  "main": "obliques",
  "helpers": ["abs", "abductors"],
  "equipment": "bodyweight"
}, {
  "name": "Sit-Up",
  "main": "abs",
  "helpers": ["quads"],
  "equipment": "bodyweight"
}, {
  "name": "Stability Ball Crunch",
  "main": "abs",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Stability Ball Knee Tuck",
  "main": "abs",
  "helpers": ["quads", "frontDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Stability Ball Pike",
  "main": "abs",
  "helpers": ["quads", "frontDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Suitcase Carry",
  "main": "obliques",
  "helpers": ["lowerBack", "abs", "forearms", "traps"],
  "equipment": "other"
}, {
  "name": "Toes to Bar",
  "main": "abs",
  "helpers": ["quads", "lats", "forearms", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Torso Rotation Machine",
  "main": "obliques",
  "helpers": ["abs"],
  "equipment": "machine"
}, {
  "name": "Weighted Plank",
  "main": "abs",
  "helpers": ["obliques", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Assisted Chin-Up",
  "main": "lats",
  "helpers": ["biceps", "upperBack", "traps"],
  "equipment": "bodyweight"
}, {
  "name": "Assisted Pull-Up",
  "main": "lats",
  "helpers": ["upperBack", "biceps"],
  "equipment": "bodyweight"
}, {
  "name": "Back Extension",
  "main": "lowerBack",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "bodyweight"
}, {
  "name": "Banded Muscle-Up",
  "main": "lats",
  "helpers": ["chest", "triceps", "frontDelts", "sideDelts", "rearDelts", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Barbell Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "barbell"
}, {
  "name": "Barbell Shrug",
  "main": "traps",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Bent-Over Dumbbell Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "dumbbell"
}, {
  "name": "Block Clean",
  "main": "traps",
  "helpers": ["lats", "lowerBack", "hamstrings", "quads", "frontDelts", "sideDelts", "rearDelts"],
  "equipment": "barbell"
}, {
  "name": "Block Snatch",
  "main": "traps",
  "helpers": ["lats", "frontDelts", "sideDelts", "rearDelts", "lowerBack", "glutes", "abductors", "hamstrings"],
  "equipment": "barbell"
}, {
  "name": "Cable Close Grip Seated Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "biceps"],
  "equipment": "cable"
}, {
  "name": "Cable Shrug",
  "main": "traps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Cable Wide Grip Seated Row",
  "main": "upperBack",
  "helpers": ["traps", "rearDelts", "lats"],
  "equipment": "cable"
}, {
  "name": "Chest to Bar",
  "main": "lats",
  "helpers": ["upperBack", "traps", "biceps"],
  "equipment": "bodyweight"
}, {
  "name": "Chest-Supported Dumbbell Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts"],
  "equipment": "dumbbell"
}, {
  "name": "Chest-Supported T-Bar Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "other"
}, {
  "name": "Chin-Up",
  "main": "lats",
  "helpers": ["biceps", "upperBack"],
  "equipment": "bodyweight"
}, {
  "name": "Clean",
  "main": "traps",
  "helpers": ["lowerBack", "lats", "glutes", "abductors", "hamstrings", "quads"],
  "equipment": "barbell"
}, {
  "name": "Clean Pull",
  "main": "traps",
  "helpers": ["lowerBack", "glutes", "hamstrings", "quads", "forearms"],
  "equipment": "barbell"
}, {
  "name": "Clean and Jerk",
  "main": "traps",
  "helpers": ["upperBack", "lats", "lowerBack", "quads", "glutes", "abductors", "frontDelts", "sideDelts", "rearDelts", "triceps", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Close-Grip Chin-Up",
  "main": "biceps",
  "helpers": ["lats"],
  "equipment": "bodyweight"
}, {
  "name": "Close-Grip Lat Pulldown",
  "main": "lats",
  "helpers": ["biceps", "upperBack", "traps"],
  "equipment": "other"
}, {
  "name": "Deficit Deadlift",
  "main": "lowerBack",
  "helpers": ["hamstrings", "glutes", "quads", "traps"],
  "equipment": "other"
}, {
  "name": "Dumbbell Deadlift",
  "main": "lowerBack",
  "helpers": ["glutes", "hamstrings", "quads", "forearms"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Shrug",
  "main": "traps",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Snatch",
  "main": "traps",
  "helpers": ["frontDelts", "sideDelts", "lowerBack", "glutes", "hamstrings", "quads", "abs", "obliques"],
  "equipment": "dumbbell"
}, {
  "name": "Floor Back Extension",
  "main": "lowerBack",
  "helpers": ["glutes"],
  "equipment": "bodyweight"
}, {
  "name": "Good Morning",
  "main": "lowerBack",
  "helpers": ["hamstrings", "glutes"],
  "equipment": "barbell"
}, {
  "name": "Gorilla Row",
  "main": "lats",
  "helpers": ["upperBack", "abs", "obliques", "biceps"],
  "equipment": "other"
}, {
  "name": "Hang Clean",
  "main": "traps",
  "helpers": ["lowerBack", "hamstrings", "glutes", "abductors", "quads"],
  "equipment": "barbell"
}, {
  "name": "Hang Power Clean",
  "main": "traps",
  "helpers": ["lowerBack", "hamstrings", "glutes", "abductors", "quads"],
  "equipment": "barbell"
}, {
  "name": "Hang Power Snatch",
  "main": "traps",
  "helpers": ["frontDelts", "sideDelts", "rearDelts", "lowerBack", "hamstrings", "glutes", "abductors"],
  "equipment": "barbell"
}, {
  "name": "Hang Snatch",
  "main": "traps",
  "helpers": ["frontDelts", "sideDelts", "rearDelts", "lowerBack", "hamstrings", "glutes", "abductors"],
  "equipment": "barbell"
}, {
  "name": "Inverted Row",
  "main": "upperBack",
  "helpers": ["traps", "lats", "rearDelts", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Inverted Row with Underhand Grip",
  "main": "lats",
  "helpers": ["biceps", "upperBack", "traps"],
  "equipment": "other"
}, {
  "name": "Jefferson Curl",
  "main": "lowerBack",
  "helpers": ["hamstrings", "glutes", "abductors"],
  "equipment": "other"
}, {
  "name": "Jumping Muscle-Up",
  "main": "lats",
  "helpers": ["chest", "triceps", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Kettlebell Clean",
  "main": "traps",
  "helpers": ["lats", "lowerBack", "glutes", "abductors", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Kettlebell Clean & Jerk",
  "main": "traps",
  "helpers": ["upperBack", "lats", "lowerBack", "frontDelts", "sideDelts", "rearDelts", "triceps", "glutes", "abductors", "quads", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Kettlebell Clean & Press",
  "main": "traps",
  "helpers": ["frontDelts", "sideDelts", "rearDelts", "triceps", "lowerBack", "glutes", "abductors"],
  "equipment": "other"
}, {
  "name": "Kettlebell Deadlift",
  "main": "lowerBack",
  "helpers": ["glutes", "hamstrings", "quads", "forearms"],
  "equipment": "other"
}, {
  "name": "Kettlebell Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "biceps"],
  "equipment": "other"
}, {
  "name": "Kettlebell Snatch",
  "main": "traps",
  "helpers": ["frontDelts", "sideDelts", "rearDelts", "lowerBack", "glutes", "abductors", "hamstrings", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Kettlebell Sumo High Pull",
  "main": "traps",
  "helpers": ["sideDelts", "rearDelts", "glutes", "adductors", "hamstrings", "quads", "lowerBack", "biceps"],
  "equipment": "other"
}, {
  "name": "Kettlebell Swing",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack", "lats", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Kroc Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "biceps", "forearms"],
  "equipment": "other"
}, {
  "name": "Lat Pulldown With Neutral Grip",
  "main": "lats",
  "helpers": ["upperBack", "biceps"],
  "equipment": "other"
}, {
  "name": "Lat Pulldown With Pronated Grip",
  "main": "lats",
  "helpers": ["upperBack", "biceps"],
  "equipment": "other"
}, {
  "name": "Lat Pulldown With Supinated Grip",
  "main": "lats",
  "helpers": ["biceps", "upperBack"],
  "equipment": "other"
}, {
  "name": "Machine Back Extension",
  "main": "lowerBack",
  "helpers": ["glutes", "hamstrings"],
  "equipment": "machine"
}, {
  "name": "Machine High Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "machine"
}, {
  "name": "Machine Lat Pulldown",
  "main": "lats",
  "helpers": ["upperBack", "biceps"],
  "equipment": "machine"
}, {
  "name": "Machine Pullover",
  "main": "lats",
  "helpers": ["upperBack", "chest"],
  "equipment": "machine"
}, {
  "name": "Machine Shrug",
  "main": "traps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Meadows Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "other"
}, {
  "name": "Muscle-Up (Bar)",
  "main": "lats",
  "helpers": ["chest", "triceps", "frontDelts", "sideDelts", "rearDelts", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Muscle-Up (Rings)",
  "main": "lats",
  "helpers": ["chest", "triceps", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Neutral Close-Grip Lat Pulldown",
  "main": "lats",
  "helpers": ["biceps", "traps"],
  "equipment": "other"
}, {
  "name": "One-Handed Cable Row",
  "main": "lats",
  "helpers": ["upperBack", "obliques", "abs"],
  "equipment": "cable"
}, {
  "name": "One-Handed Kettlebell Swing",
  "main": "glutes",
  "helpers": ["hamstrings", "lowerBack", "obliques", "abs"],
  "equipment": "other"
}, {
  "name": "One-Handed Lat Pulldown",
  "main": "lats",
  "helpers": ["obliques", "biceps"],
  "equipment": "other"
}, {
  "name": "Pause Deadlift",
  "main": "lowerBack",
  "helpers": ["glutes", "hamstrings", "traps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Pendlay Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "lowerBack", "biceps"],
  "equipment": "other"
}, {
  "name": "Power Clean",
  "main": "traps",
  "helpers": ["lowerBack", "hamstrings", "glutes", "abductors", "quads"],
  "equipment": "barbell"
}, {
  "name": "Power Snatch",
  "main": "traps",
  "helpers": ["frontDelts", "sideDelts", "rearDelts", "lowerBack", "glutes", "abductors", "hamstrings"],
  "equipment": "barbell"
}, {
  "name": "Pull-Up",
  "main": "lats",
  "helpers": ["upperBack", "biceps"],
  "equipment": "bodyweight"
}, {
  "name": "Pull-Up With a Neutral Grip",
  "main": "lats",
  "helpers": ["biceps", "upperBack"],
  "equipment": "bodyweight"
}, {
  "name": "Rack Pull",
  "main": "lowerBack",
  "helpers": ["traps", "upperBack", "glutes", "forearms"],
  "equipment": "barbell"
}, {
  "name": "Renegade Row",
  "main": "lats",
  "helpers": ["upperBack", "abs", "obliques", "frontDelts"],
  "equipment": "other"
}, {
  "name": "Resistance Band Good Morning",
  "main": "lowerBack",
  "helpers": ["hamstrings", "glutes"],
  "equipment": "other"
}, {
  "name": "Resistance Band Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "other"
}, {
  "name": "Ring Pull-Up",
  "main": "lats",
  "helpers": ["biceps", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Ring Row",
  "main": "upperBack",
  "helpers": ["traps", "lats", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Rope Climb",
  "main": "lats",
  "helpers": ["upperBack", "biceps", "forearms", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Rope Pulldown",
  "main": "lats",
  "helpers": ["upperBack", "rearDelts"],
  "equipment": "other"
}, {
  "name": "Scap Pull-Up",
  "main": "traps",
  "helpers": ["upperBack", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Seal Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts"],
  "equipment": "other"
}, {
  "name": "Seated Machine Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "biceps"],
  "equipment": "machine"
}, {
  "name": "Single Leg Deadlift with Kettlebell",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Smith Machine Deadlift",
  "main": "lowerBack",
  "helpers": ["glutes", "hamstrings", "traps"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Good Morning",
  "main": "lowerBack",
  "helpers": ["hamstrings", "glutes"],
  "equipment": "machine"
}, {
  "name": "Smith Machine One-Handed Row",
  "main": "lats",
  "helpers": ["upperBack", "traps"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "machine"
}, {
  "name": "Smith Machine Shrug",
  "main": "traps",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Snatch",
  "main": "traps",
  "helpers": ["frontDelts", "sideDelts", "rearDelts", "lowerBack", "glutes", "abductors", "hamstrings", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Snatch Grip Deadlift",
  "main": "traps",
  "helpers": ["upperBack", "lowerBack", "glutes", "hamstrings", "forearms"],
  "equipment": "other"
}, {
  "name": "Stiff-Legged Deadlift",
  "main": "hamstrings",
  "helpers": ["glutes", "lowerBack"],
  "equipment": "other"
}, {
  "name": "Straight Arm Lat Pulldown",
  "main": "lats",
  "helpers": ["upperBack", "triceps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Sumo Deadlift",
  "main": "glutes",
  "helpers": ["adductors", "quads", "lowerBack", "traps"],
  "equipment": "other"
}, {
  "name": "Superman Raise",
  "main": "lowerBack",
  "helpers": ["glutes", "traps", "upperBack"],
  "equipment": "bodyweight"
}, {
  "name": "T-Bar Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "other"
}, {
  "name": "Towel Row",
  "main": "lats",
  "helpers": ["upperBack", "forearms"],
  "equipment": "other"
}, {
  "name": "Trap Bar Deadlift With High Handles",
  "main": "quads",
  "helpers": ["glutes", "lowerBack", "traps", "forearms"],
  "equipment": "other"
}, {
  "name": "Trap Bar Deadlift With Low Handles",
  "main": "quads",
  "helpers": ["glutes", "lowerBack", "hamstrings", "traps"],
  "equipment": "other"
}, {
  "name": "Underhand Barbell Row",
  "main": "lats",
  "helpers": ["upperBack", "traps", "rearDelts", "biceps"],
  "equipment": "barbell"
}, {
  "name": "Barbell Seated Calf Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Barbell Standing Calf Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Calf Raise in Hack Squat Machine",
  "main": "calves",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Calf Raise in Leg Press",
  "main": "calves",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Donkey Calf Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Dumbbell Calf Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Eccentric Heel Drop",
  "main": "calves",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Heel Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "One-Legged Calf Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Seated Calf Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Smith Machine Calf Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Standing Calf Raise",
  "main": "calves",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Bar Hang",
  "main": "forearms",
  "helpers": ["lats"],
  "equipment": "bodyweight"
}, {
  "name": "Barbell Reverse Wrist Curl",
  "main": "forearms",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Barbell Wrist Curl",
  "main": "forearms",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Barbell Wrist Curl Behind the Back",
  "main": "forearms",
  "helpers": [],
  "equipment": "barbell"
}, {
  "name": "Cable Wrist Curl",
  "main": "forearms",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Dumbbell Reverse Wrist Curl",
  "main": "forearms",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Wrist Curl",
  "main": "forearms",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Farmers Walk",
  "main": "forearms",
  "helpers": ["traps", "abs", "obliques"],
  "equipment": "other"
}, {
  "name": "Fat Bar Deadlift",
  "main": "forearms",
  "helpers": ["lowerBack", "glutes", "abductors", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Gripper",
  "main": "forearms",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "One-Handed Bar Hang",
  "main": "forearms",
  "helpers": ["abs", "obliques", "lats"],
  "equipment": "bodyweight"
}, {
  "name": "Plate Pinch",
  "main": "forearms",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Plate Wrist Curl",
  "main": "forearms",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Towel Pull-Up",
  "main": "forearms",
  "helpers": ["lats", "biceps"],
  "equipment": "bodyweight"
}, {
  "name": "Wrist Roller",
  "main": "forearms",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Banded Side Kicks",
  "main": "abductors",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Barbell Glute Bridge",
  "main": "glutes",
  "helpers": ["hamstrings", "abs", "obliques"],
  "equipment": "barbell"
}, {
  "name": "Cable Glute Kickback",
  "main": "glutes",
  "helpers": ["hamstrings"],
  "equipment": "cable"
}, {
  "name": "Cable Machine Hip Abduction",
  "main": "abductors",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "Cable Pull Through",
  "main": "glutes",
  "helpers": ["hamstrings", "lowerBack"],
  "equipment": "cable"
}, {
  "name": "Clamshells",
  "main": "abductors",
  "helpers": ["glutes"],
  "equipment": "bodyweight"
}, {
  "name": "Cossack Squat",
  "main": "glutes",
  "helpers": ["quads", "adductors", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Death March with Dumbbells",
  "main": "glutes",
  "helpers": ["hamstrings", "lowerBack"],
  "equipment": "dumbbell"
}, {
  "name": "Donkey Kicks",
  "main": "glutes",
  "helpers": ["hamstrings"],
  "equipment": "bodyweight"
}, {
  "name": "Dumbbell Frog Pumps",
  "main": "glutes",
  "helpers": [],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Hip Thrust",
  "main": "glutes",
  "helpers": ["hamstrings", "quads"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Kickstand Romanian Deadlift",
  "main": "glutes",
  "helpers": ["hamstrings", "lowerBack", "abductors"],
  "equipment": "dumbbell"
}, {
  "name": "Dumbbell Romanian Deadlift",
  "main": "glutes",
  "helpers": ["hamstrings", "lowerBack"],
  "equipment": "dumbbell"
}, {
  "name": "Fire Hydrants",
  "main": "abductors",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Frog Pumps",
  "main": "glutes",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Glute Bridge",
  "main": "glutes",
  "helpers": ["hamstrings", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Glute Bridge With Band Around Knees",
  "main": "glutes",
  "helpers": ["abductors", "hamstrings"],
  "equipment": "other"
}, {
  "name": "Hip Abduction Against Band",
  "main": "abductors",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Hip Abduction Machine",
  "main": "abductors",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Hip Thrust",
  "main": "glutes",
  "helpers": ["hamstrings", "quads"],
  "equipment": "other"
}, {
  "name": "Hip Thrust Machine",
  "main": "glutes",
  "helpers": ["hamstrings"],
  "equipment": "machine"
}, {
  "name": "Hip Thrust With Band Around Knees",
  "main": "glutes",
  "helpers": ["abductors"],
  "equipment": "other"
}, {
  "name": "Kettlebell Sumo Deadlift",
  "main": "glutes",
  "helpers": ["adductors", "hamstrings", "quads", "lowerBack"],
  "equipment": "other"
}, {
  "name": "Kettlebell Windmill",
  "main": "abductors",
  "helpers": ["obliques", "hamstrings", "upperBack"],
  "equipment": "other"
}, {
  "name": "Lateral Walk With Band",
  "main": "abductors",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Machine Glute Kickbacks",
  "main": "glutes",
  "helpers": ["hamstrings"],
  "equipment": "machine"
}, {
  "name": "One-Legged Glute Bridge",
  "main": "glutes",
  "helpers": ["hamstrings", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "One-Legged Hip Thrust",
  "main": "glutes",
  "helpers": ["hamstrings", "abs", "obliques"],
  "equipment": "bodyweight"
}, {
  "name": "Reverse Hyperextension",
  "main": "glutes",
  "helpers": ["hamstrings", "lowerBack"],
  "equipment": "machine"
}, {
  "name": "Side-Lying Hip Abduction",
  "main": "abductors",
  "helpers": [],
  "equipment": "bodyweight"
}, {
  "name": "Single Leg Romanian Deadlift",
  "main": "glutes",
  "helpers": ["hamstrings", "abs", "obliques", "lowerBack"],
  "equipment": "other"
}, {
  "name": "Smith Machine Hip Thrust",
  "main": "glutes",
  "helpers": ["hamstrings"],
  "equipment": "machine"
}, {
  "name": "Standing Glute Kickback in Machine",
  "main": "glutes",
  "helpers": [],
  "equipment": "machine"
}, {
  "name": "Standing Glute Push Down",
  "main": "glutes",
  "helpers": ["hamstrings"],
  "equipment": "machine"
}, {
  "name": "Standing Hip Abduction Against Band",
  "main": "abductors",
  "helpers": [],
  "equipment": "other"
}, {
  "name": "Cable Tricep Extension",
  "main": "triceps",
  "helpers": [],
  "equipment": "cable"
}, {
  "name": "High to Low Cable Chest Fly",
  "main": "chest",
  "helpers": ["frontDelts"],
  "equipment": "cable"
}, {
  "name": "Bird Dog",
  "main": "abs",
  "helpers": ["lowerBack", "glutes", "rearDelts"],
  "equipment": "bodyweight"
}, {
  "name": "Russian Twist",
  "main": "obliques",
  "helpers": ["abs", "quads"],
  "equipment": "other"
}];
// Exceptions take precedence over broad words such as squat, row and deadlift.
const equipmentOverrides: Record<string, Equipment> = {
  'Goblet Squat': 'dumbbell', 'Inverted Row': 'bodyweight',
  'Inverted Row with Underhand Grip': 'bodyweight', 'Ring Row': 'bodyweight',
  'Towel Row': 'bodyweight', 'Resistance Band Row': 'other',
  'Resistance Band Romanian Deadlift': 'other', 'Landmine Hack Squat': 'barbell',
  'Air Squat': 'bodyweight', 'Half Air Squat': 'bodyweight',
  'Jump Squat': 'bodyweight', 'Chair Squat': 'bodyweight', 'Pistol Squat': 'bodyweight',
  'Cossack Squat': 'bodyweight', 'Sissy Squat': 'bodyweight',
  'Belt Squat': 'machine', 'Pendulum Squat': 'machine',
  'Plate Loaded Low Row': 'machine', 'Assisted Dip': 'machine',
  'EZ Curl': 'barbell', 'Kroc Row': 'dumbbell', 'Renegade Row': 'dumbbell',
  'Gorilla Row': 'dumbbell', 'Monkey Row': 'dumbbell',
  'Bayesian Curl': 'cable', 'Face Pull': 'cable',
};
function bundledEquipment(exercise: Exercise): Equipment {
  const name = exercise.name;
  if (equipmentOverrides[name]) return equipmentOverrides[name];
  // Bands, kettlebells and plates have no suitable equipment step in this model.
  if (/kettlebell|resistance band/i.test(name)) return 'other';
  if (/machine|smith|leg press|pec deck|hack/i.test(name)) return 'machine';
  if (/dumbbell|\bDB\b/i.test(name)) return 'dumbbell';
  if (/cable|pulldown|pushdown/i.test(name)) return 'cable';
  if (/pull[ -]?up|chin[ -]?up|push[ -]?up|\bdip\b|plank|body[ -]?weight/i.test(name)) return 'bodyweight';
  if (/barbell|bench press|squat|deadlift|\brow\b|overhead press|close[ -]grip|EZ[ -]bar/i.test(name)) return 'barbell';
  return exercise.equipment;
}
export const exerciseLibrary: Exercise[] = bundledExercises.map(exercise => ({
  ...exercise, equipment: bundledEquipment(exercise),
}));
export function exerciseFor(name: string): Exercise {
  return exerciseLibrary.find(e => e.name.toLowerCase() === name.trim().toLowerCase()) ?? {
    name: name.trim(),
    helpers: [],
    equipment: 'other'
  };
}
