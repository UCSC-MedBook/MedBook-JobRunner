function InternalError (job_id) {
  Job.call(this, job_id);
}
InternalError.prototype = Object.create(Job.prototype);
InternalError.prototype.constructor = InternalError;

InternalError.prototype.run = function () {
  var deferred = Q.defer();

  Q().delay(2000).then(function () {
    throw "Internal error";
  });

  return deferred.promise;
};

JobClasses.InternalError = InternalError;
