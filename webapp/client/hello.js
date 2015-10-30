Template.listJobs.onCreated(function () {
  var instance = Template.instance();

  instance.subscribe("allJobs");
});

Template.listJobs.helpers({
  getJobs: function () {
    return Jobs.find({}, {
      sort: { status: 1 }
    });
  },
});

Template.jobsHelp.helpers({
  getJobsHelp: function () {
    return [
      {
        name: "ParseWranglerFile",
        help: "Sets options in an uploaded file and tries to parse it for summary data",
      },
      {
        name: "SubmitWranglerFile",
        help: "Parses and writes a file into the database",
      },
      {
        name: "SubmitWranglerSubmission",
        help: "Verifies options and lines up each wrangler file to be " +
            "written into the database",
      },
      {
        name: "FinishWranglerSubmission",
        help: "Sets the status of a submission after all of the files have " +
            "been parsed and written into the database.",
      },
      {
        name: "RunLimma",
        help: "Runs limma",
      },
    ];
  },
});
