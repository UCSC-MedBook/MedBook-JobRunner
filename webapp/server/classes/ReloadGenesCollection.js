function ReloadGenesCollection (job_id) {
  Job.call(this, job_id);
}
ReloadGenesCollection.prototype = Object.create(Job.prototype);
ReloadGenesCollection.prototype.constructor = ReloadGenesCollection;
ReloadGenesCollection.prototype.run = function () {
  console.log("run method");

  fileHandler = new WranglerFileTypes.HGNCGeneList(this.job.args.blob_id);
  return fileHandler.parse();
};
ReloadGenesCollection.prototype.onError = function () {
  // TODO: email someone!
  console.log("there was an error in ReloadGenesCollection");
};

JobClasses.ReloadGenesCollection = ReloadGenesCollection;
