Meteor.methods({
  get_email : function(user_id) {
    check(user_id, String);
    var user = "";
    if (user_id) {
        try {
          Users = new Meteor.Collection("users");
        }
        catch(err) {
          console.log('error creating users collections', err);
        }
        user = Users.findOne({_id:user_id});
      try {
       return user.profile.email;
      }
      catch(err) {
        try {
         return user.emails[0].address;
        }
        catch(err) {
            if (user.services) {
              return user.services.google.email;
            }
        }
      }
    }
  }
});
