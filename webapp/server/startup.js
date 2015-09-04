function runNextJob () {

  // TODO: need to make sure we don't grab the same job twice
  var job = Jobs.findOne({ "status": "waiting" },
      { sort: [["date_created", "ascending"]] });

  function setJobStatus(newStatus) {
    Jobs.update(job._id, { $set: { "status": newStatus } });
  }

  function whenDone() {
    setJobStatus("done");
  }

  if (job) {
    setJobStatus("running");

    var jobFunction = jobMethods[job.name];
    if (jobFunction) {
      console.log("running job:", job._id, job.name);
      try {
        return jobFunction(job.args, whenDone);
      } catch (e) {
        setJobStatus("waiting"); // TODO: just for now
        console.log("error running job:", e);
        return "error running job";
      }
    } else {
      console.log("unknown job name:", job.name);
    }
  } else {
    // console.log("no jobs available :(");
    return "no jobs available";
  }
}

Meteor.startup(function () {
  console.log("Server is starting!");

  SyncedCron.config({
    // Log job run details to console
    log: true,
    logger: function (opts) {
      // quiet yourself now
    },
  });

  SyncedCron.add({
    name: 'start-next-job',
    schedule: function(parser) {
      // parser is a later.parse object
      return parser.text('every 2 seconds');
    },
    job: runNextJob,
  });

  SyncedCron.start();
});
