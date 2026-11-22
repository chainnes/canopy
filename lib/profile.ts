/** Fictional freelancer. Not a real person and not a real CV. */

export const PROFILE = {
  name: "Mara Ellison",
  floorHourly: 75,
  platformFee: 0.1,
  skills: ["typescript", "python", "automation", "api", "postgres", "webhook"],
  chunks: [
    {
      id: "prof_bio",
      title: "Profile",
      text: "Mara Ellison is a fictional freelance automation consultant. She builds TypeScript and Python automations, HTTP APIs, and webhook routers. Only the projects in her notes are hers.",
    },
    {
      id: "prof_harbor",
      title: "Harbor Ledger sync",
      text: "Project Harbor Ledger. A fictional nightly TypeScript job that reads a Postgres table of warehouse counts and posts each changed row to a webhook.",
    },
    {
      id: "prof_clinic",
      title: "Northwind reminders",
      text: "Project Northwind reminders. A fictional Python automation API that sends appointment reminders. It makes no medical claims.",
    },
    {
      id: "prof_press",
      title: "Fieldpress router",
      text: "Project Fieldpress router. A fictional TypeScript service that receives webhooks and routes them to internal queues.",
    },
    {
      id: "prof_rate",
      title: "Rate floor",
      text: "Rate floor is 75 USD per hour. Assume a 10 percent platform fee when a post quotes a fixed budget. Mara does not accept upfront fees, cryptocurrency, or off-platform payment before a contract.",
    },
  ],
};
