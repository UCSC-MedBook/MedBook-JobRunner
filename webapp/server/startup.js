function runNextJob () {
  // grab the first job
  var mongoJob = Jobs.findOne({ "status": "waiting" },
      { sort: [["date_modified", "ascending"]] });

  // if there's no job available, quit
  if (!mongoJob) {
    return;
  }

  // try to claim the job as ours
  var updateCount = Jobs.update({
    _id: mongoJob._id,
    status: "waiting",
  }, {
    $set: { status: "running" },
    $unset: { error_description: 1 },
  });
  if (updateCount === 0) { // make sure we really got it
    return;
  }

  function retryLater (error_description) {
    if (error_description) {
      console.log("job: retrying - " + error_description);
      Jobs.update(mongoJob._id, {
        $set: {
          status: "waiting",
          error_description: error_description,
        },
        $inc: { "retry_count": 1 }
      });
    } else {
      // sometimes we just want to throw it back and not tell anyone
      Jobs.update(mongoJob._id, {
        $set: { status: "waiting" },
      });
    }
  }

  // make sure the user is only running one task
  if (Jobs.find({
        status: "running",
        user_id: mongoJob.user_id,
      }).count() > 1) {
    return retryLater();
  }

  // this is down here because theoretically we could be running two tasks from
  // the same user and we want to make sure we quit out before printing if
  // that comes to pass
  console.log("job: running - ", mongoJob.name);

  // check to see if something else has to be done first
  var mustHaveFinished = Jobs.findOne(mongoJob.prerequisite_job_id);
  if (mustHaveFinished && mustHaveFinished.status !== "done") {
    // if there was an error with that one, there's an error with this one
    if (mustHaveFinished.status === "error") {
      Jobs.update(mongoJob._id, {
        $set: {
          status: "error",
          error_description: "error in prerequisite job",
        }
      });
    } else {
      retryLater("not finished with prerequisite job");
    }
    return;
  }

  // get the job's class
  var jobClass = JobClasses[mongoJob.name];
  if (!jobClass) {
    Jobs.update(mongoJob._id, {
      $set: {
        status: "error",
        error_description: "job class not defined",
      }
    });
  }

  // create a Job object
  var job;
  try {
    job = new jobClass(mongoJob._id);
  } catch (e) {
    console.log("Error creating job object:", e);
    Jobs.update(mongoJob._id, {
      $set: {
        status: "error",
        error_description: e.toString(),
      }
    });
    return;
  }

  // if we should retry, don't bother running the job
  if (job.reasonForRetry) {
    retryLater(job.reasonForRetry);
    return;
  }

  // define helper in case things get bad
  var nope = function (reason) {
    var errorWarningUser;
    try {
      job.onError(reason);
    } catch (e) {
      errorWarningUser = e;
    }

    var error_description = "Reason for rejection: " + reason + ".";
    console.log("job: rejected - ", reason);
    if (reason.stack) {
      console.log("stack trace:", reason.stack);
    }
    if (errorWarningUser) {
      error_description += " Error calling onError: " + errorWarningUser;
    }
    Jobs.update(mongoJob._id, {
      $set: {
        status: "error",
        error_description: error_description,
        stack_trace: reason.stack,
      }
    });
  };

  // run the job
  try { // wrap so we can catch errors in job.run()
    var boundNope = Meteor.bindEnvironment(nope);
    Q.when(job.run())
      .then(Meteor.bindEnvironment(function (result) {
        if (job.reasonForRetry) {
          retryLater(job.reasonForRetry);
        } else {
          job.onSuccess(result);
          Jobs.update(mongoJob._id, {
            $set: { status: "done" }
          });
          console.log("job: done");
        }
      }), boundNope)
      .catch(boundNope);
  } catch (e) {
    nope(e);
  }
}

Meteor.startup(function () {
  console.log("Server is starting!");

  Jobs.update({
    status: "running"
  }, {
    $set: {
      status: "error",
      ription: "Server restarted"
    }
  }, {multi: true});

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
