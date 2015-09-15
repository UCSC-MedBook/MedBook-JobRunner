function setJobStatus(job, newStatus) {
  console.log("job:", newStatus);
  Jobs.update(job._id, { $set: { "status": newStatus } });
}

function whenDone(job) {
  setJobStatus(job, "done");
}

function runNextJob () {

  if (Jobs.findOne({"status": "running"})) {
    console.log("already running a job");
    return;
  }

  // TODO: need to make sure we don't grab the same job twice
  var job = Jobs.findOne({ "status": "waiting" },
      { sort: [["date_created", "ascending"]] });

  if (job) {
    setJobStatus(job, "running");

    var jobFunction = jobMethods[job.name];
    if (jobFunction) {
      console.log("running job:", job._id, job.name);
      try {
        var callback = _.partial(whenDone, job);
        return jobFunction(job.args, Meteor.bindEnvironment(callback));
      } catch (e) {
        setJobStatus(job, "waiting"); // TODO: just for now
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
      // console.log('Message', opts.message);
    },
  });

  SyncedCron.add({
    name: 'start-next-job',
    schedule: function(parser) {
      // parser is a later.parse object
      return parser.text('every 1 seconds');
    },
    job: runNextJob,
  });

  SyncedCron.start();
});
