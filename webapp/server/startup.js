function whenDone(jobId, options) {
  // TODO: increase retry_count
  var setObject = {
    "status": "done"
  };

  if (options) {
    if (options.error) {
      setObject.error_description = options.error;
      setObject.status = "error";
    }

    if (options.rerun === true) {
      setObject.status = "waiting"; // overrides "error"
    }
  }

  console.log("job:", setObject);
  Jobs.update(jobId, {
    $set: setObject
  });
  return setObject.status;
}

function runNextJob () {
  // TODO: use jobDone instead of whenDone

  // grab the first job
  var currentJob = Jobs.findOne({ "status": "waiting" },
      { sort: [["date_modified", "ascending"]] });
  if (currentJob) {
    var jobId = currentJob._id;
    var jobDone = _.partial(whenDone, jobId);
    try {
      // check to see if another job is being run by the same user
      if (Jobs.findOne({
            status: "running",
            user_id: currentJob.user_id,
          })) {
        console.log("already running a job for this user");
        return "other job with same user_id already started";
      }

      // check to see if something else has to be done first
      var mustHaveFinished = Jobs.findOne(currentJob.prerequisite_job_id);
      if (!mustHaveFinished || mustHaveFinished.status === "done") {
        // try to claim the job as ours
        var updateCount = Jobs.update({
          _id: jobId,
          status: "waiting",
        }, {
          $set: {
            status: "running",
          },
          $unset: {
            error_description: 1
          }
        });

        // make sure we actually got it (another JobRunner could have stolen it)
        if (updateCount === 0) {
          return "another JobRunner stole the job";
        }

        // find and run the correct method
        var toRun = jobMethods[currentJob.name];
        if (toRun) {
          // make sure toRun meets the schema
          // NOTE: I don't trust SimpleSchema with validating type Function
          if (typeof toRun.onRun !== "function" ||
              typeof toRun.onError !== "function" ||
              typeof toRun.argumentSchema !== "object") {
            return jobDone({
              error: "job function incorrectly defined"
            });
          }

          // make sure the arguments meet the schema
          try {
            check(currentJob.args, toRun.argumentSchema);
          } catch (e) {
            return jobDone({
              error: "arguments do not match schema",
            });
          }

          // actually run the job
          console.log("running job:", jobId, currentJob.name);
          try {
            toRun.onRun(currentJob.args, Meteor.bindEnvironment(jobDone));
          } catch (e) {
            console.log("caught:", e);
            var errorDescription = e.toString();
            toRun.onError(currentJob.args, errorDescription);
            return jobDone({ error: errorDescription });
          }
          return "started job: " + currentJob.name;
        } else {
          console.log("unknown job name:", currentJob.name);
          return jobDone({ error: "Unknown job name" });
        }
      } else {
        // if there was an error with that one, there's an error with this one
        if (mustHaveFinished.status === "error") {
          return jobDone({ error: "Error in prerequisite job" });
        } else {
          console.log("haven't done prerequisite job yet:", mustHaveFinished._id);
          return jobDone({ rerun: true });
        }
      }
    } catch (e) {
      return jobDone({
        error: "internal server error [" + e.toString() + "]",
        rerun: true,
      });
    }
  } else {
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
