function UpdateCbioSecurity (job_id) {
  console.log('updateCbioSec  urity()')
  Job.call(this, job_id);
}
UpdateCbioSecurity.prototype = Object.create(Job.prototype);
UpdateCbioSecurity.prototype.constructor = UpdateCbioSecurity;

UpdateCbioSecurity.prototype.run = function () {
  console.log('starting UpdateCbioSecurity')
  for (var i in this.job.args.collaborationList) {
    var c = this.job.args.collaborationList[i]
    console.log('collab list',c, 'index' , i)
    //Collaborations = new Meteor.Collection("collaborations");
    var cobj = Collaborations.findOne({name:c})
    console.log('collab ',cobj)
    var members = cobj.getAssociatedCollaborators()
    console.log('members',members)
  };
}
JobClasses.UpdateCbioSecurity = UpdateCbioSecurity;
