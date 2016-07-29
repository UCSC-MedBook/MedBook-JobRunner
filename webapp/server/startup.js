function runNextJob () {
  // grab the first job
  var mongoJob = Jobs.findOne({ "status": "waiting" },
      { sort: [["date_modified", "ascending"]] });
  var job; // undefined for the moment

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
    if (mongoJob.retry_count > 120) { // give them at least 2 minutes
      error_description = 'too many retries: ' + error_description;

      if (job) {
        job.onError('too many retries');
      }

      console.log("job thrown out after too many retries");
      Jobs.update(mongoJob.id, {
        $set: {
          status: 'error',
          error_description: 'too many retries'
        }
      });
    } else {
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
  console.log("");
  console.log("job: running - ", mongoJob.name,
      "{ _id: \"" + mongoJob._id + "\" }");

  // check to see if something else has to be done first
  var mustHaveFinished = Jobs.find({
    _id: {$in: mongoJob.prerequisite_job_ids}
  }).fetch();
  for (var index = 0; index<mustHaveFinished.length; index++) {
    // if there was an error with that one, there's an error with this one
    if (mustHaveFinished[index].status === "error") {
      Jobs.update(mongoJob._id, {
        $set: {
          status: "error",
          error_description: "error in prerequisite job",
        }
      });
      return;
    // Prerequisites are still running; retry again later.
    } else if(mustHaveFinished[index].status !== "done"){
      retryLater("not finished with prerequisite job");
      return;
    }
  }
  // All prerequisites are "done"; carry on.

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
  try {
    job = new jobClass(mongoJob._id);
  } catch (e) {
    console.log("Error creating job object:", e);
    Jobs.update(mongoJob._id, {
      $set: {
        status: "error",
        error_description: e.toString(),
        stack_trace: e.stack,
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

    var error_description = reason + ""; // convert to string
    console.log("job: rejected - ", reason);
    var stackTrace = "";
    if (reason && reason.stack) {
      stackTrace = reason.stack
      console.log("stack trace:", stackTrace);
    }
    if (errorWarningUser) {
      error_description += " Error calling onError: " + errorWarningUser;
    }
    Jobs.update(mongoJob._id, {
      $set: {
        status: "error",
        error_description: error_description,
        stack_trace: stackTrace,
      }
    });
  };

  // run the job
  try { // wrap so we can catch errors in job.run()
    var boundNope = Meteor.bindEnvironment(nope);
    Q.when(job.run()).timeout(mongoJob.timeout_length)
      .then(Meteor.bindEnvironment(function (output) {
        if (job.reasonForRetry) {
          retryLater(job.reasonForRetry);
        } else {
          // if no output, default to empty object
          if (!output) { output = {}; }

          // set the job as done in mongo
          Jobs.update(mongoJob._id, {
            $set: {
              output: output,
              status: "done"
            }
          });
          console.log("job: done");

          try {
            job.onSuccess(output);
          } catch (e) {
            console.log("Error in onSuccess for " + mongoJob._id);
          }
        }
      }), boundNope)
      .catch(boundNope);
  } catch (e) {
    nope(e);
  }
}

Meteor.startup(function () {
  console.log("Server is starting!");

  // set errors for jobs that got killed
  Jobs.update({
    status: "running"
  }, {
    $set: {
      status: "error",
      error_description: "Server restarted"
    }
  }, {multi: true});

  // make sure the DataSets collection is okay and we can still wrangle things
  DataSets.update({}, {
    $set: {
      currently_wrangling: false
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
