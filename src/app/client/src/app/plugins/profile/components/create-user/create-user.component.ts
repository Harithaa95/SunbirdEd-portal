import { Component, OnInit } from '@angular/core';
import {InterpolatePipe, ResourceService, ToasterService, ServerResponse, UtilService, NavigationHelperService } from '@sunbird/shared';
import { ProfileService } from './../../services';
import { FormBuilder, Validators, FormGroup, FormControl } from '@angular/forms';
import * as _ from 'lodash-es';
import { IInteractEventObject, IInteractEventEdata, IImpressionEventInput } from '@sunbird/telemetry';
import {
  OrgDetailsService,
  ChannelService,
  FrameworkService,
  UserService,
  FormService,
  TncService,
  ManagedUserService
} from '@sunbird/core';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-create-user',
  templateUrl: './create-user.component.html',
  styleUrls: ['./create-user.component.scss']
})
export class CreateUserComponent implements OnInit {

  userDetailsForm: FormGroup;
  sbFormBuilder: FormBuilder;
  enableSubmitBtn = false;
  tncLatestVersion: any;
  termsAndConditionLink: any;
  showTncPopup = false;
  instance: string;
  formData;
  showLoader = true;
  telemetryImpression: IImpressionEventInput;
  submitInteractEdata: IInteractEventEdata;
  submitCancelInteractEdata: IInteractEventEdata;
  pageId = 'create-managed-user';

  constructor(public resourceService: ResourceService, public toasterService: ToasterService,
    public profileService: ProfileService, formBuilder: FormBuilder, public router: Router,
    public userService: UserService, public orgDetailsService: OrgDetailsService, public channelService: ChannelService,
    public frameworkService: FrameworkService, public utilService: UtilService, public formService: FormService,
    private activatedRoute: ActivatedRoute, public navigationhelperService: NavigationHelperService,
    public tncService: TncService, private managedUserService: ManagedUserService) {
    this.sbFormBuilder = formBuilder;
  }

  ngOnInit() {
    this.setTelemetryData();
    this.instance = _.upperCase(this.resourceService.instance || 'SUNBIRD');
    this.fetchTncData();
    this.getFormDetails();
  }

  setTelemetryData() {
    this.telemetryImpression = {
      context: {
        env: this.activatedRoute.snapshot.data.telemetry.env
      },
      edata: {
        type: this.activatedRoute.snapshot.data.telemetry.type,
        pageid: this.pageId,
        subtype: this.activatedRoute.snapshot.data.telemetry.subtype,
        uri: this.router.url,
        duration: this.navigationhelperService.getPageLoadTime()
      }
    };

    this.submitInteractEdata = {
      id: 'submit-create-managed-user',
      type: 'click',
      pageid: this.pageId
    };

    this.submitCancelInteractEdata = {
      id: 'cancel-create-managed-user',
      type: 'click',
      pageid: this.pageId
    };
  }

  getFormDetails() {
    const formServiceInputParams = {
      formType: 'user',
      formAction: 'create',
      contentType: 'child',
      component: 'portal'
    };
    this.formService.getFormConfig(formServiceInputParams, this.userService.hashTagId).subscribe((formData) => {
      this.formData = formData;
      this.initializeFormFields();
    }, (err) => {
      this.toasterService.error(_.get(this.resourceService, 'messages.emsg.m0005'));
      this.showLoader = false;
    });
  }

  fetchTncData() {
    this.tncService.getTncConfig()
      .pipe(map((data) => {
        const response = _.get(data, 'result.response.value');
        return this.utilService.parseJson(response);
      })).subscribe((tncConfig) => {
        this.tncLatestVersion = _.get(tncConfig, 'latestVersion') || {};
        this.termsAndConditionLink = tncConfig[this.tncLatestVersion].url;
      }, (err) => {
        this.toasterService.error(_.get(this.resourceService, 'messages.fmsg.m0004'));
      });
  }

  showAndHidePopup(mode: boolean) {
    this.showTncPopup = mode;
  }

  initializeFormFields() {
    const formGroupObj = {};
    for (const key of this.formData) {
      if (key.visible && key.required) {
        formGroupObj[key.code] = new FormControl(null, [Validators.required]);
      } else if (key.visible) {
        formGroupObj[key.code] = new FormControl(null);
      }
    }

    this.userDetailsForm = this.sbFormBuilder.group(formGroupObj, {
      validator: (formControl) => {
        const nameCtrl = formControl.controls.name;
        if (_.trim(nameCtrl.value) === '') {
          nameCtrl.setErrors({ required: true });
        }
        return null;
      }
    });
    this.showLoader = false;
    this.enableSubmitBtn = (this.userDetailsForm.status === 'VALID');
    this.enableSubmitButton();
  }

  enableSubmitButton() {
    this.userDetailsForm.valueChanges.subscribe(val => {
      this.enableSubmitBtn = (this.userDetailsForm.status === 'VALID');
    });
  }

  onCancel() {
    this.navigationhelperService.navigateToPreviousUrl('/profile');
  }

  onSubmitForm() {
    this.enableSubmitBtn = false;
    const createUserRequest = {
      request: {
        firstName: this.userDetailsForm.value.name,
        managedBy: this.managedUserService.getUserId()
      }
    };
    this.managedUserService.getParentProfile().subscribe((userProfileData) => {
      createUserRequest.request['locationIds'] = _.map(_.get(userProfileData, 'userLocations'), 'id');
      if (_.get(userProfileData, 'framework') && !_.isEmpty(_.get(userProfileData, 'framework'))) {
        createUserRequest.request['framework'] = _.get(userProfileData, 'framework');
      }
      this.registerUser(createUserRequest, userProfileData);
    });
  }

  registerUser(createUserRequest, userProfileData) {
    this.userService.registerUser(createUserRequest).subscribe((resp: ServerResponse) => {
        const requestBody = {
          request: {
            version: _.get(userProfileData, 'tncLatestVersion'),
            userId: _.get(resp, 'result.userId')
          }
        };
        this.managedUserService.updateUserList({
          firstName: this.userDetailsForm.value.name,
          identifier: _.get(resp, 'result.userId'),
          id: _.get(resp, 'result.userId'),
          managedBy: this.managedUserService.getUserId()
        });
        this.userService.acceptTermsAndConditions(requestBody).subscribe(res => {
          const filterPipe = new InterpolatePipe();
          const successMessage = filterPipe.transform(_.get(this.resourceService, 'messages.imsg.m0096'),
            '{firstName}', this.userDetailsForm.value.name);
          this.toasterService.custom({
            message: successMessage,
            class: 'sb-toaster sb-toast-success sb-toast-normal'
          });
          this.router.navigate(['/profile/choose-managed-user']);
        }, err => {
          this.toasterService.error(this.resourceService.messages.fmsg.m0085);
          this.enableSubmitBtn = true;
        });
      },
      (err) => {
        if (_.get(err, 'error.params.status') === 'MANAGED_USER_LIMIT_EXCEEDED') {
          this.toasterService.error(_.get(this.resourceService, 'messages.fmsg.m0100'));
        } else {
          this.toasterService.error(this.resourceService.messages.fmsg.m0085);
        }
        this.enableSubmitBtn = true;
      }
    );
  }
}