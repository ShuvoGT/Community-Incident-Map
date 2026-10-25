import "dotenv/config";
import { recomputeAllWindows } from "../services/aggregates";

// Recompute the weekly aggregates for all cells with published incidents.
//   npm run recompute
recomputeAllWindows().then(
  (n) => {
    console.info(`Recomputed ${n} cell aggregate(s).`);
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
