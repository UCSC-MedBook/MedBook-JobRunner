function GeneTranscriptMappings (job_id) {
  Job.call(this, job_id);
}
GeneTranscriptMappings.prototype = Object.create(Job.prototype);
GeneTranscriptMappings.prototype.constructor = GeneTranscriptMappings;
GeneTranscriptMappings.prototype.run = function () {
  var fileHandler = new WranglerFileTypes.GeneTranscriptMappings(this.job.args.blob_id);
  return fileHandler.parse();
};
GeneTranscriptMappings.prototype.onError = function () {
  // TODO: email someone!
  console.log("there was an error in GeneTranscriptMappings");
};

JobClasses.GeneTranscriptMappings = GeneTranscriptMappings;
