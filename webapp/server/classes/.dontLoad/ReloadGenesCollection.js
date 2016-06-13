function ReloadGenesCollection (job_id) {
  Job.call(this, job_id);

  // TODO: make sure the blob is stored
}
ReloadGenesCollection.prototype = Object.create(Job.prototype);
ReloadGenesCollection.prototype.constructor = ReloadGenesCollection;
ReloadGenesCollection.prototype.run = function () {
  Genes.remove({}); // TODO: scary!

  var fileHandler = new WranglerFileHandlers.HGNCGeneList(this.job.args.blob_id);
  return fileHandler.parse();
};
ReloadGenesCollection.prototype.onError = function () {
  // TODO: email someone!
  console.log("there was an error in ReloadGenesCollection");
};

JobClasses.ReloadGenesCollection = ReloadGenesCollection;
