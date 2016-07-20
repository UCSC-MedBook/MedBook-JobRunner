function UpdateCbioSecurity (job_id) {
  Job.call(this, job_id);
}
UpdateCbioSecurity.prototype = Object.create(Job.prototype);
UpdateCbioSecurity.prototype.constructor = UpdateCbioSecurity;

UpdateCbioSecurity.prototype.run = function () {
  for (var i in this.job.args.collaborationList) {
    var c = this.job.args.collaborationList[i]
    console.log('collab list',c, 'index' , i)
    var members = Collaborations.findOne({name:c}).getAssociatedCollaborators()
    console.log('members',members)
  };
}
JobClasses.UpdateCbioSecurity = UpdateCbioSecurity;
