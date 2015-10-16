function runNextJob () {
  // grab the first job
  var mongoJob = Jobs.findOne({ "status": "waiting" },
      { sort: [["date_modified", "ascending"]] });
  if (mongoJob) {
    var job_id = mongoJob._id;

    // NOTE: using var because it shouldn't have function scope
    var retryLater = function (error_description) {
      Jobs.update(job_id, {
        $set: {
          status: "waiting",
          error_description: error_description,
        },
        $inc: { "retry_count": 1 }
      });
    };

    try {
      // check to see if another job is being run by the same user
      if (Jobs.findOne({
            status: "running",
            user_id: mongoJob.user_id,
          })) {
        console.log("already running a job for this user");
      }

      // check to see if something else has to be done first
      var mustHaveFinished = Jobs.findOne(mongoJob.prerequisite_job_id);
      if (!mustHaveFinished || mustHaveFinished.status === "done") {
        // try to claim the job as ours
        var updateCount = Jobs.update({
          _id: job_id,
          status: "waiting",
        }, {
          $set: { status: "running" },
          $unset: { error_description: 1 },
        });

        // make sure we actually got it (another JobRunner could have stolen it)
        if (updateCount === 0) {
          return;
        }

        // get the job's class
        var jobClass = JobClasses[mongoJob.name];
        if (!jobClass) {
          Jobs.update(job_id, {
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
          Jobs.update(job_id, {
            $set: {
              status: "error",
              error_description: e.toString(),
            }
          });
          return;
        }

        if (job.reasonForRetry) {
          retryLater(job.reasonForRetry);
          return;
        }

        // run the job
        try {
          BlueBird.resolve(job.run())
              .then(Meteor.bindEnvironment(function (result) {
                console.log("result of job.run resolution:", result);
                job.onSuccess(result);
              }))
              .catch(function (reason) {
                console.log("job was rejected for some reason:", reason);
                job.onError(reason);
              });
        } catch (e) {
          console.log("onError called with e:", e);
          job.onError(e);
        }
      } else {
        // if there was an error with that one, there's an error with this one
        if (mustHaveFinished.status === "error") {
          Jobs.update(job_id, {
            $set: {
              status: "error",
              error_description: "error in prerequisite job",
            }
          });
        } else {
          retryLater("not finished with prerequisite job");
        }
      }
    } catch (e) {
      console.log("internal server error:", e);
      Jobs.update(job_id, {
        $set: {
          status: "error",
          error_description: "internal server error: " + e.toString(),
        }
      });
    }
  }
}

Meteor.startup(function () {
  console.log("Server is starting!");

  Jobs.update({
    status: "running"
  }, {
    $set: {
      status: "error",
      error_description: "Server restarted"
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
