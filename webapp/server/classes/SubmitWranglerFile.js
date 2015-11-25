function SubmitWranglerFile (job_id) {
  WranglerFileJob.call(this, job_id);
}
SubmitWranglerFile.prototype = Object.create(WranglerFileJob.prototype);
SubmitWranglerFile.prototype.constructor = SubmitWranglerFile;
SubmitWranglerFile.prototype.run = function () {
  // figure out which FileHandler to create
  var fileHandler = new WranglerFileTypes[this.wranglerFile.options.file_type]
      (this.wranglerFile._id);
  return fileHandler.parse();
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
SubmitWranglerFile.prototype.onSuccess = function (result) {
  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      written_to_database: true,
    }
  });
};

JobClasses.SubmitWranglerFile = SubmitWranglerFile;
