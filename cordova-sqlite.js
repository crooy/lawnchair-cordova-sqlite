/*globals Lawnchair, sqlitePlugin */
'use strict';

Lawnchair.adapter('sqlite-plugin', (function () {
    // private methods
    var fail = function(query){ return  function (e, i) { console.log('error in sqlite adaptor!  '+query+" message was "+JSON.stringify(i)); } },
        now  = function () { return new Date(); }; // FIXME need to use better date fn
	// not entirely sure if this is needed...
    if (!Function.prototype.bind) {
        Function.prototype.bind = function( obj ) {
            var slice = [].slice,
                args  = slice.call(arguments, 1),
                self  = this,
                Nop   = function () {},
                bound = function () {
                    return self.apply(this instanceof Nop ? this : (obj || {}), args.concat(slice.call(arguments)));
                };
            Nop.prototype   = self.prototype;
            bound.prototype = new Nop();
            return bound;
        };
    }

    // public methods
    return {

        valid: function() {
            return (window.sqlitePlugin && sqlitePlugin.openDatabase);
        },

        init: function (options, callback) {
            var that   = this,
                cb     = that.fn(that.name, callback),
                dbname = options.db || this.name,
                bgType = options.bgType || 1,
                create = 'CREATE TABLE IF NOT EXISTS ' + this.name + ' (id NVARCHAR(64) PRIMARY KEY, value TEXT, timestamp REAL)',
                win    = function(){ return cb.call(that, that); };
            // open a connection and create the db if it doesn't exist
            this.db = sqlitePlugin.openDatabase({name:dbname,bgType:bgType});
            this.db.transaction(function (t) {
                t.executeSql(create, [], win, fail(create));
            });
        },

        keys:  function (callback) {
            var cb   = this.lambda(callback),
                that = this,
                keys = 'SELECT id FROM ' + this.name + ' ORDER BY timestamp DESC';

            this.db.transaction(function(t) {
                var win = function (xxx, results) {
                    if (results.rows.length === 0 ) {
                        cb.call(that, []);
                    } else {
                        var r = [];
                        for (var i = 0, l = results.rows.length; i < l; i++) {
                            r.push(results.rows.item(i).id);
                        }
                        cb.call(that, r);
                    }
                };
                t.executeSql(keys, [], win, fail(keys));
            });
            return this;
        },
        // you think thats air you're breathing now?
        save: function (obj, callback, error) {
            console.log("sqlite save called");
          var that = this
          ,   objs = (this.isArray(obj) ? obj : [obj]).map(function(o){if(!o.key) { o.key = that.uuid()} return o})
          ,   ins  = "REPLACE INTO " + this.name + " (value, timestamp, id) VALUES (?,?,?)"
          ,   win  = function () { if (callback) { that.lambda(callback).call(that, that.isArray(obj)?objs:objs[0]) }}
          ,   error= error || function() {}
          ,   insvals = []
          ,   ts = now()

          try {
            for (var i = 0, l = objs.length; i < l; i++) {
              insvals[i] = [JSON.stringify(objs[i]), ts, objs[i].key];
            }
          } catch (e) {
            console.log("error while saving "+JSON.stringify(e));
            fail(ins)(e);
            throw e;
          }

             that.db.transaction(function(t) {
            for (var i = 0, l = objs.length; i < l; i++)
              t.executeSql(ins, insvals[i]);
             }, function(e,i){fail(ins)(e,i);}, win);

          return this;
        },


        batch: function (objs, callback, error) {
          console.log("sqlite batch save called");
          return this.save(objs, callback, error);
        },

        get: function (keyOrArray, cb) {
			var that = this,
			    sql  = '';
            // batch selects support
			if (this.isArray(keyOrArray)) {
				sql = "SELECT id, value FROM " + this.name + " WHERE id IN ('" + keyOrArray.join("','") + "')";
			} else {
				sql = "SELECT id, value FROM " + this.name + " WHERE id = '" + keyOrArray + "'";
			}
			// FIXME
            // will always loop the results but cleans it up if not a batch return at the end..
			// in other words, this could be faster
			var win = function (xxx, results) {
				var o = null,
				    r = [];
				if (results.rows.length) {
					for (var i = 0, l = results.rows.length; i < l; i++) {
						o = JSON.parse(results.rows.item(i).value);
						o.key = results.rows.item(i).id;
						r.push(o);
					}
				}

				if (!that.isArray(keyOrArray)) {
          r = r.length ? r[0] : null;
        }

				if (cb) {
          that.lambda(cb).call(that, r);
        }
            };
            this.db.transaction(function(t){ t.executeSql(sql, [], win, fail(sql)); });
            return this;
		},

		exists: function (key, cb) {
			var is = 'SELECT * FROM ' + this.name + ' WHERE id = ?',
			    that = this,
			    win = function(xxx, results) {
            if (cb) {
              that.fn('exists', cb).call(that, (results.rows.length > 0));
            }
          };
			this.db.transaction(function(t){ t.executeSql(is, [key], win, fail(is)); });
			return this;
		},

		all: function (callback) {
			var that = this,
			    all  = 'SELECT * FROM ' + this.name,
			    r    = [],
			    cb   = this.fn(this.name, callback) || undefined,
			    win  = function (xxx, results) {
				if (results.rows.length !== 0) {
					for (var i = 0, l = results.rows.length; i < l; i++) {
						var obj = JSON.parse(results.rows.item(i).value);
						obj.key = results.rows.item(i).id;
						r.push(obj);
					}
				}
				if (cb) {
          cb.call(that, r);
        }
			};

			this.db.transaction(function (t) {
				t.executeSql(all, [], win, fail(all));
			});
			return this;
		},

		remove: function (keyOrObj, cb) {
			var that = this,
			    key  = typeof keyOrObj === 'string' ? keyOrObj : keyOrObj.key,
			    del  = 'DELETE FROM ' + this.name + ' WHERE id = ?',
			    win  = function () { if (cb) { that.lambda(cb).call(that); } };

			this.db.transaction( function (t) {
				t.executeSql(del, [key], win, fail(del));
			});

			return this;
		},

		nuke: function (cb) {
			var nuke = 'DELETE FROM ' + this.name,
			    that = this,
			    win  = cb ? function() { that.lambda(cb).call(that); } : function(){};
				this.db.transaction(function (t) {
				t.executeSql(nuke, [], win, fail(nuke));
			});
			return this;
		}
//////
};})());
