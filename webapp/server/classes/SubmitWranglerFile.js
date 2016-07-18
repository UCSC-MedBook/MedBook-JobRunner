function SubmitWranglerFile (job_id) {
  WranglerFileJob.call(this, job_id);
}
SubmitWranglerFile.prototype = Object.create(WranglerFileJob.prototype);
SubmitWranglerFile.prototype.constructor = SubmitWranglerFile;
SubmitWranglerFile.prototype.run = function () {
  // figure out which FileHandler to create
  var options = this.wranglerFile.options;
  var fileHandler = new WranglerFileHandlers[options.file_type]
      (this.wranglerFile._id);

  // make sure the options match the schema
  var optionsSchema = Wrangler.fileTypes[options.file_type].schema;
  if (!optionsSchema.newContext().validate(_.omit(options, "file_type"))) {
    throw "Invalid options";
  }

  var self = this;
  var deferred = Q.defer();

  fileHandler.parse()
    .then(Meteor.bindEnvironment(function () {
      WranglerFiles.update(self.wranglerFile._id, {
        $set: {
          written_to_database: true,
        }
      });
      deferred.resolve();
    }, deferred.reject))
    .catch(deferred.reject);

  return deferred.promise;
};
SubmitWranglerFile.prototype.onError = function (e) {
  // TODO: should this be the correct behaviour?
  console.log("How can we have an onError in SubmitWranglerFile after going " +
      "through ParseWranglerFile...");
  var wranglerFile = WranglerFiles.findOne(this.job.args.wrangler_file_id);
  WranglerSubmissions.update(wranglerFile.submission_id, {
    $set: {
      status: "editing"
    },
    $addToSet: {
      errors: "Error running write job: " + e,
    }
  });
};

JobClasses.SubmitWranglerFile = SubmitWranglerFile;
