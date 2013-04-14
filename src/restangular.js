var module = angular.module('restangular', ['ngResource']);

module.provider('Restangular', function() {
        // Configuration
        /**
         * This is the BaseURL to be used with Restangular
         */
        this.baseUrl = "";
        this.setBaseUrl = function(baseUrl) {
            this.baseUrl = baseUrl;
        }
        
        /**
         * Sets the extra fields to keep from the parents
         */
        this.extraFields = [];
        this.setExtraFields = function(extraFields) {
            this.extraFields = extraFields;
        }
        
        /**
         * Sets the URL creator type. For now, only Path is created. In the future we'll have queryParams
        **/
        this.urlCreator = "path";
        this.setUrlCreator = function(name) {
            if (!_.has(urlCreatorFactory, name)) {
                throw new Error("URL Path selected isn't valid");
            }
            this.urlCreator = name;
        }
        
        /**
         * You can set the restangular fields here. The 3 required fields for Restangular are:
         * 
         * id: Id of the element
         * route: name of the route of this element
         * parentResource: the reference to the parent resource
         * 
         *  All of this fields except for id, are handled (and created) by Restangular. By default, 
         *  the field values will be id, route and parentResource respectively
         */
        this.restangularFields = {
            id: "id",
            route: "route",
            parentResource: "parentResource"
        }
        this.setRestangularFields = function(resFields) {
            this.restangularFields = _.extend(this.restangularFields, resFields);
        }
        
        /**
         * Sets the Response parser. This is used in case your response isn't directly the data.
         * For example if you have a response like {meta: {'meta'}, data: {name: 'Gonto'}}
         * you can extract this data which is the one that needs wrapping
         *
         * The ResponseExtractor is a function that receives the response and the method executed.
         */
        this.responseExtractor = function(response, method) {
            return response;
        }
        this.setResponseExtractor = function(extractor) {
            this.responseExtractor = extractor;
        }

        //Internal values and functions
        var urlCreatorFactory = {};
        
        /**
         * This is the Path URL creator. It uses Path to show Hierarchy in the Rest API.
         * This means that if you have an Account that then has a set of Buildings, a URL to a building
         * would be /accounts/123/buildings/456
        **/
        var Path = function(baseUrl, restangularFields) {
            this.baseUrl = baseUrl;
            this.restangularFields = restangularFields;
        }
        
        Path.prototype.base = function(current) {
            var __restangularFields = this.restangularFields;
            return this.baseUrl + _.reduce(this.parentsArray(current), function(acum, elem) {
                var currUrl = acum + "/" + elem[__restangularFields.route];
                if (elem[__restangularFields.id]) {
                    currUrl += "/" + elem[__restangularFields.id];
                }
                return currUrl;
            }, '');
        }
        
        Path.prototype.parentsArray = function(current) {
            var parents = [];
            while(!_.isUndefined(current)) {
                parents.push(current);
                current = current[this.restangularFields.parentResource];
            }
            return parents.reverse();
        }
        
        Path.prototype.fetchUrl = function(what, current) {
            return this.base(current) + "/" + what.toLowerCase();
        }
        
        Path.prototype.resource = function(current, $resource, headers) {
            return $resource(this.base(current) + "/:what" , {}, {
                getArray: {method: 'GET', params: {}, isArray: true, headers: headers || {}},
                get: {method: 'GET', params: {}, isArray: false, headers: headers || {}},
                put: {method: 'PUT', params: {}, isArray: false, headers: headers || {}},
                post: {method: 'POST', params: {}, isArray: false, headers: headers || {}},
                remove: {method: 'DELETE', params: {}, isArray: false, headers: headers || {}}
            });
        }
        
        urlCreatorFactory.path = Path;
        
        
        
       this.$get = ['$resource', '$q', function($resource, $q) {
          var urlHandler = new urlCreatorFactory[this.urlCreator](this.baseUrl, this.restangularFields);
          var __extraFields = this.extraFields;
          var __responseExtractor = this.responseExtractor;
          var __restangularFields = this.restangularFields;
          
          function restangularize(parent, elem, route) {
              elem[__restangularFields.route] = route;
              elem.getList = _.bind(fetchFunction, elem);
              elem.get = _.bind(getFunction, elem);
              elem.put = _.bind(putFunction, elem);
              elem.post = _.bind(postFunction, elem);
              elem.remove = _.bind(deleteFunction, elem);
              
              if (parent) {
                  var restangularFieldsForParent = _.chain(__restangularFields)
                          .pick(['id', 'route', 'parentResource'])
                          .values()
                          .union(__extraFields)
                          .value();
                  elem[__restangularFields.parentResource]= _.pick(parent, restangularFieldsForParent);
              }
              return elem;
          }
          
          function fetchFunction(what, params, headers) {
              var search = what ? {what: what} : {};
              var __this = this;
              var deferred = $q.defer();
              
              urlHandler.resource(this, $resource, headers).getArray(_.extend(search, params), function(resData) {
                  var data = __responseExtractor(resData, 'get');
                  var processedData = _.map(data, function(elem) {
                      if (what) {
                          return restangularize(__this, elem, what);
                      } else {
                          return restangularize(null, elem, __this[__restangularFields.route]);
                      }
                      
                  });
                  deferred.resolve(processedData);
              }, function error() {
                  deferred.reject(arguments)
              });
              
              return deferred.promise;
          }
          
          function elemFunction(operation, params, obj, headers) {
              var __this = this;
              var deferred = $q.defer();
              var resParams = params || {};
              var resObj = obj || this;
              
              var okCallback = function(resData) {
                  var elem = __responseExtractor(resData, operation);
                  if (elem) {
                      deferred.resolve(restangularize(__this[__restangularFields.parentResource], elem, __this[__restangularFields.route]));
                  } else {
                      deferred.resolve();
                  }
              };
              
              var errorCallback = function() {
                  deferred.reject(arguments)
              };
              
              if (operation === 'get') {
                  urlHandler.resource(this, $resource, headers)[operation](resParams, okCallback, errorCallback);
              } else {
                  urlHandler.resource(this, $resource, headers)[operation](resParams, resObj, okCallback, errorCallback);
              }
              
              return deferred.promise;
          }
          
          function getFunction(params, headers) {
              return _.bind(elemFunction, this)("get", params, undefined, headers);;
          }
          
          function deleteFunction(params, headers) {
              return _.bind(elemFunction, this)("remove", params, {}, headers);
          }
          
          function putFunction(params, headers) {
              return _.bind(elemFunction, this)("put", params, undefined, headers);
          }

          function postFunction(what, elem, params, headers) {
              return _.bind(elemFunction, this)("post", _.extend({what: what}, params), elem, headers);
          }
          
          
          var service = {};
          
          service.one = function(route, id) {
              var elem = {};
              elem[__restangularFields.id] = id;
              return restangularize(null, elem , route);
          }
          
          service.all = function(route) {
              return restangularize(null, {} , route);
          }
          
          return service;
       
        }];
    }
);

