import "dotenv/config";
import { runRetention } from "../services/retention";

// Manually apply the retention policy once (the worker also runs it daily).
//   npm run retention
runRetention().then(
  (summary) => {
    console.info("Retention run complete:", JSON.stringify(summary, null, 2));
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
