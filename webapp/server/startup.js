function runNextJob () {
  // grab the first job
  var mongoJob = Jobs.findOne({ "status": "waiting" },
      { sort: [["date_modified", "ascending"]] });

  function retryLater (error_description) {
    Jobs.update(mongoJob._id, {
      $set: {
        status: "waiting",
        error_description: error_description,
      },
      $inc: { "retry_count": 1 }
    });
  }

  if (mongoJob) {
    try {
      // check to see if something else has to be done first
      var mustHaveFinished = Jobs.findOne(mongoJob.prerequisite_job_id);
      if (!mustHaveFinished || mustHaveFinished.status === "done") {
        // try to claim the job as ours
        var updateCount = Jobs.update({
          _id: mongoJob._id,
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

        if (job.reasonForRetry) {
          retryLater(job.reasonForRetry);
          return;
        }

        // helper if things get bad
        var nope = function (reason) {
          var errorWarningUser;
          try {
            job.onError(reason);
          } catch (e) {
            errorWarningUser = e;
          }

          var error_description = "Reason for rejection: " + reason + ".";
          console.log("reason for rejection:", reason);
          if (errorWarningUser) {
            error_description += " Error calling onError: " + errorWarningUser;
          }
          Jobs.update(mongoJob._id, {
            $set: {
              status: "error",
              error_description: error_description,
            }
          });
        };

        // run the job
        try { // wrap so we can catch errors in job.run()
          Bluebird.resolve(job.run())
            .then(Meteor.bindEnvironment(function (result) {
              console.log("result of job.run resolution:", result);
              try {
                job.onSuccess(result);

                Jobs.update(mongoJob._id, {
                  $set: { status: "done" }
                });
              } catch (e) {
                console.log("e on onSuccess:", e);
                console.log("typeof e:", typeof e);
                for (var i in e) {
                  console.log("i, e[i]:", i, e[i]);
                }
                nope(e);
              }
            }))
            .catch(Meteor.bindEnvironment(nope));
        } catch (e) {
          nope(e);
        }
      } else {
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
      }
    } catch (e) {
      console.log("internal server error:", e);
      Jobs.update(mongoJob._id, {
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
