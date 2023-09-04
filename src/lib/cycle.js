export function JSONRetrocycle($) {
	'use strict';

	var px = /^\$(?:\[(?:\d+|"(?:[^\\"\u0000-\u001f]|\\(?:[\\"\/bfnrt]|u[0-9a-zA-Z]{4}))*")\])*$/;

	(function rez(value) {
		if (value && typeof value === 'object') {
			if (Array.isArray(value)) {
				value.forEach(function (element, i) {
					if (typeof element === 'object' && element !== null) {
						var path = element.$ref;
						if (typeof path === 'string' && px.test(path)) {
							value[i] = eval(path);
						} else {
							rez(element);
						}
					}
				});
			} else {
				Object.keys(value).forEach(function (name) {
					var item = value[name];
					if (typeof item === 'object' && item !== null) {
						var path = item.$ref;
						if (typeof path === 'string' && px.test(path)) {
							value[name] = eval(path);
						} else {
							rez(item);
						}
					}
				});
			}
		}
	})($);
	return $;
}
