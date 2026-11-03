/**
 * Shared kernel: response envelope, errors, ids, money and the event outbox.
 * Every other module may depend on this one; it depends on none of them.
 */
@org.springframework.modulith.ApplicationModule(type = org.springframework.modulith.ApplicationModule.Type.OPEN)
package com.tailorae.common;
